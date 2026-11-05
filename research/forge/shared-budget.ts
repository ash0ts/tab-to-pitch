import { DatabaseSync } from 'node:sqlite';
import { PRICES, validUsage, type HistoricalLedger, type Model } from '../teacher-agent/budget.js';

/** All participating campaigns must use the same absolute SQLite path. A copied ledger is not shared. */
export class SharedInferenceBudget {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS authorization (id INTEGER PRIMARY KEY CHECK(id=1), ceiling INTEGER NOT NULL, historical INTEGER NOT NULL, provenance TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS circuit (id INTEGER PRIMARY KEY CHECK(id=1), reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, campaign TEXT NOT NULL, model TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER, settled INTEGER NOT NULL DEFAULT 0);`);
  }
  initialize(prior: HistoricalLedger) {
    if (
      !prior.sources.length ||
      !Number.isFinite(prior.dollars) ||
      prior.dollars < 0 ||
      Math.abs(prior.sources.reduce((sum, s) => sum + s.dollars, 0) - prior.dollars) > 1e-8
    )
      throw new Error('A reconciled historical ledger is required.');
    this.db
      .prepare('INSERT OR IGNORE INTO authorization VALUES (1,25000000,?,?)')
      .run(Math.ceil(prior.dollars * 1e6), JSON.stringify(prior));
    const current = this.db
      .prepare('SELECT historical,provenance FROM authorization WHERE id=1')
      .get() as { historical: number; provenance: string };
    if (current.provenance !== JSON.stringify(prior))
      throw new Error('Historical ledger differs. Reconcile it; never reset authorization.');
  }
  reserve(id: string, campaign: string, model: Model, inputBytes: number, outputTokens: number) {
    if (
      !PRICES[model] ||
      !Number.isSafeInteger(inputBytes) ||
      inputBytes < 0 ||
      inputBytes > 49152 ||
      !Number.isSafeInteger(outputTokens) ||
      outputTokens < 1 ||
      outputTokens > 4096
    )
      throw new Error('Invalid inference reservation.');
    const micro = Math.ceil(
      (inputBytes + 128) * PRICES[model].input + outputTokens * PRICES[model].output,
    );
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT reason FROM circuit WHERE id=1').get())
        throw new Error('Shared accounting is halted pending reconciliation.');
      const auth = this.db.prepare('SELECT * FROM authorization WHERE id=1').get() as
        | { ceiling: number; historical: number }
        | undefined;
      if (!auth) throw new Error('Historical spending has not been reconciled.');
      const totals = this.db
        .prepare(
          'SELECT COALESCE(SUM(COALESCE(charged,reserved)),0) AS total, COALESCE(SUM(CASE WHEN campaign=? THEN COALESCE(charged,reserved) ELSE 0 END),0) AS own FROM reservations',
        )
        .get(campaign) as { total: number; own: number };
      if (auth.historical + totals.total + micro > auth.ceiling || totals.own + micro > 15_000_000)
        throw new Error('Shared inference authorization exhausted.');
      this.db
        .prepare('INSERT INTO reservations(id,campaign,model,reserved) VALUES(?,?,?,?)')
        .run(id, campaign, model, micro);
      this.db.exec('COMMIT');
      return micro / 1e6;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  settle(id: string, usage: unknown) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT * FROM reservations WHERE id=?').get(id) as
        | { model: Model; reserved: number; settled: number }
        | undefined;
      if (!row || row.settled) throw new Error('Unknown or already settled reservation.');
      const valid = validUsage(usage),
        price = PRICES[row.model];
      const charge = valid
        ? Math.ceil(valid.prompt_tokens * price.input + valid.completion_tokens * price.output)
        : row.reserved;
      if (charge > row.reserved) {
        this.db
          .prepare('INSERT OR REPLACE INTO circuit VALUES(1,?)')
          .run('Usage exceeded reserved bound');
        this.db.exec('COMMIT');
        throw new Error('Usage exceeded the reserved bound; reconcile before more calls.');
      }
      this.db.prepare('UPDATE reservations SET charged=?,settled=1 WHERE id=?').run(charge, id);
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }
  read() {
    return {
      authorization: this.db.prepare('SELECT * FROM authorization WHERE id=1').get(),
      reservations: this.db.prepare('SELECT * FROM reservations ORDER BY rowid').all(),
    };
  }
  close() {
    this.db.close();
  }
}

# Illustrated studio integration

The studio changes were applied to the integrated teaching, CAGED, live-input and Ear Lab layers. Shared files retain the newer controllers and grading contracts. Ear Lab is reachable and remains optional. The teacher drawer returns to an accepted homework task.

Local checks: 430 unit tests passed, two PostgreSQL tests skipped without an isolated database; typecheck and production build passed. Browser checks passed for 16 homework/teaching cases, 10 live-input cases, four Ear Lab cases, and the studio flows (10 passed initially, one persistence-only mobile duplicate skipped; the zoom failure was corrected and both zoom layouts passed on rerun). These counts describe this integration checkpoint, not the final release.

The 200% mobile layout now wraps navigation rather than widening the document. AlphaTab stays measurable when its notation is masked; the player remains the only score and audio controller. Hardware audio and live teacher qualification were not run.

Source ownership: `CODEOWNERS` assigns this standalone application to @ash0ts. Original assets and their provenance are included; personal songs and recordings are excluded.

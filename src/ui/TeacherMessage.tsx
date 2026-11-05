/** A small, non-HTML prose renderer. Model text never becomes executable markup. */
export function TeacherMessage({ text }: { text: string }) {
  const inline = (line: string) =>
    line
      .split(/(\*\*[^*\n]+\*\*)/g)
      .map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      );
  return (
    <div className="teacher-prose">
      {text.split(/\n\s*\n/).map((paragraph, index) => {
        const lines = paragraph.split('\n');
        return lines.every((line) => /^[-*] /.test(line)) ? (
          <ul key={index}>
            {lines.map((line, i) => (
              <li key={i}>{inline(line.slice(2))}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{inline(paragraph)}</p>
        );
      })}
    </div>
  );
}

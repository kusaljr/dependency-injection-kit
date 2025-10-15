export const Colors = {
  Reset: "\x1b[0m",
  Green: "\x1b[32m",
  Yellow: "\x1b[33m",
  Red: "\x1b[31m",
};

export function logQueryExecution(sql: string, durationMs: number) {
  let color = Colors.Red;
  if (durationMs < 100) {
    color = Colors.Green;
  } else if (durationMs < 200) {
    color = Colors.Yellow;
  }

  console.log(`Executing SQL: ${sql}`);
  console.log(
    `Execution Time: ${color}${durationMs.toFixed(2)}ms${Colors.Reset}`
  );
}

const { start } = require("./server/start");

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

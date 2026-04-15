const noteRepositoryTest = require('./noteRepository.test');
const rendererCoreTest = require('./rendererCore.test');

async function run() {
  const tests = [
    ['note repository', noteRepositoryTest],
    ['renderer core', rendererCoreTest]
  ];

  for (const [name, execute] of tests) {
    await execute();
    console.log(`PASS ${name}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

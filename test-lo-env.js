const { spawnSync } = require('child_process');
const path = require('path');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";

function testEnv(envMap) {
  console.log("Testing env...", envMap);
  const result = spawnSync(loPath, ['--headless', '--version'], {
    env: Object.assign({}, process.env, envMap)
  });
  console.log("Exit code:", result.status);
}

testEnv({ SAL_DISABLE_OPENCL: '1' });
testEnv({ SAL_DISABLE_OPENGL: '1', SAL_ENABLE_SWRENDER: '1' });
testEnv({ SAL_DISABLE_VULKAN: '1' });
testEnv({ SAL_DISABLE_HWACCEL: '1' });

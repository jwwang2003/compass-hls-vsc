import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VitisHLSInfo {
  /** e.g. "v2022.1" */
  version: string;
  /** e.g. "3526262" */
  swBuild: string;
  /** e.g. "3524634" */
  ipBuild: string;
  /** full stdout+stderr from the tool */
  log: string;
}

/**
 * Runs `vitis_hls -version`, throws if the tool isn’t found
 * or if the output doesn’t match the expected pattern.
 */
export async function getVitisHLSInfo(env: NodeJS.ProcessEnv = process.env): Promise<VitisHLSInfo> {
  try {
    // run the command
    const { stdout, stderr } = await execAsync('vitis_hls -version', { env });
    const log = stdout + stderr;

    // parse the lines we care about
    const versionMatch = log.match(/^.*\sv([\d.]+).*/m);
    const swMatch      = log.match(/SW Build\s+(\d+)/i);
    const ipMatch      = log.match(/IP Build\s+(\d+)/i);

    if (!versionMatch || !swMatch || !ipMatch) {
      throw new Error(`Unexpected vitis_hls output:\n${log}`);
    }

    return {
      version: `v${versionMatch[1]}`,
      swBuild: swMatch[1],
      ipBuild: ipMatch[1],
      log
    };
  } catch (err: any) {
    // handle “command not found”
    if (err.code === 'ENOENT') {
      throw new Error(
        'vitis_hls not found. Please install Vitis HLS or add it to your PATH.'
      );
    }
    // re-throw anything else (e.g. non-zero exit with weird output)
    throw err;
  }
}

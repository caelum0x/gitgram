import * as fs from 'fs';
import * as path from 'path';
import { TimeMachineEngine } from '../core/index.js';
import { assertConsent } from '../auth/consent-policy.js';
import { beginExportTrace, completeExportTrace } from '../export/traceability.js';

export async function exportCheckpoint(
  engine: TimeMachineEngine,
  checkpointId: string,
  outputPath: string
): Promise<void> {
  assertConsent(engine.getProjectPath(), 'export_operational', {
    source: 'core.export.exportCheckpoint',
    resource: outputPath,
  });
  const trace = beginExportTrace({
    projectPath: engine.getProjectPath(),
    action: 'export_operational',
    source: 'core.export.exportCheckpoint',
    resource: outputPath,
  });

  try {
    const tp = engine.getTimePoint(checkpointId);
    if (!tp) throw new Error('Checkpoint not found');

    const tmpDir = path.join('/tmp', `aitm_export_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    // Write checkpoint metadata
    fs.writeFileSync(
      path.join(tmpDir, 'checkpoint.json'),
      JSON.stringify(tp, null, 2)
    );

    // Copy file blobs
    const blobsDir = path.join(tmpDir, 'blobs');
    fs.mkdirSync(blobsDir, { recursive: true });

    for (const file of tp.files) {
      const content = engine.getFileAt(tp.id, file.path);
      if (content) {
        const blobPath = path.join(blobsDir, file.hash);
        fs.mkdirSync(path.dirname(blobPath), { recursive: true });
        fs.writeFileSync(blobPath, content);
      }
    }

    // Create tarball using tar command
    const { execSync } = require('child_process');
    execSync(`tar -czf ${outputPath} -C ${tmpDir} .`);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
    completeExportTrace(trace, {
      success: true,
      outputPath,
      stats: { checkpointId, files: tp.files.length },
    });
  } catch (error) {
    completeExportTrace(trace, {
      success: false,
      error,
    });
    throw error;
  }
}

export async function importCheckpoint(
  engine: TimeMachineEngine,
  archivePath: string
): Promise<string> {
  const tmpDir = path.join('/tmp', `aitm_import_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Extract tarball
  const { execSync } = require('child_process');
  execSync(`tar -xzf ${archivePath} -C ${tmpDir}`);

  // Read checkpoint metadata
  const checkpointData = JSON.parse(
    fs.readFileSync(path.join(tmpDir, 'checkpoint.json'), 'utf-8')
  );

  // Import blobs
  const blobsDir = path.join(tmpDir, 'blobs');
  // Would need to copy blobs to content store

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });

  return checkpointData.id;
}

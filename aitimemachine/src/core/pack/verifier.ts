import * as fs from 'fs';
import * as crypto from 'crypto';
import { PackReader } from './reader.js';

/**
 * Verify pack file integrity
 */
export class PackVerifier {
  /**
   * Verify pack file and index
   */
  static verify(packPath: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check files exist
    const idxPath = packPath.replace('.pack', '.idx');
    if (!fs.existsSync(packPath)) {
      errors.push('Pack file not found');
      return { valid: false, errors };
    }
    if (!fs.existsSync(idxPath)) {
      errors.push('Index file not found');
      return { valid: false, errors };
    }
    
    try {
      // Load index
      const idx = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
      
      // Verify pack checksum
      const packContent = fs.readFileSync(packPath);
      const actualHash = crypto.createHash('sha256').update(packContent).digest('hex');
      
      if (idx.packHash !== actualHash) {
        errors.push(`Pack checksum mismatch: expected ${idx.packHash}, got ${actualHash}`);
      }
      
      // Verify objects are readable
      const reader = new PackReader(packPath);
      let objectsChecked = 0;
      let objectsFailed = 0;
      
      for (const hash of Object.keys(idx.objects)) {
        try {
          const content = reader.get(hash);
          if (!content) {
            errors.push(`Object ${hash} not readable`);
            objectsFailed++;
          } else {
            objectsChecked++;
          }
        } catch (e) {
          errors.push(`Object ${hash} error: ${e instanceof Error ? e.message : String(e)}`);
          objectsFailed++;
        }
      }
      
      if (objectsFailed > 0) {
        errors.push(`${objectsFailed}/${objectsChecked + objectsFailed} objects failed verification`);
      }
      
    } catch (e) {
      errors.push(`Verification error: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    return { valid: errors.length === 0, errors };
  }
}

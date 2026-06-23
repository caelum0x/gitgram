import * as fs from 'fs';
import * as path from 'path';

export interface CheckpointAnnotation {
  checkpointId: string;
  notes: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class AnnotationStore {
  private annotations = new Map<string, CheckpointAnnotation>();
  private filePath: string;

  constructor(basePath: string) {
    this.filePath = path.join(basePath, '.aitimemachine', 'annotations.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        for (const [id, ann] of Object.entries(data)) {
          const a = ann as any;
          this.annotations.set(id, {
            ...a,
            createdAt: new Date(a.createdAt),
            updatedAt: new Date(a.updatedAt)
          });
        }
      }
    } catch { /* ignore */ }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const data: Record<string, any> = {};
    for (const [id, ann] of this.annotations) {
      data[id] = {
        ...ann,
        createdAt: ann.createdAt.toISOString(),
        updatedAt: ann.updatedAt.toISOString()
      };
    }
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  setNote(checkpointId: string, notes: string): CheckpointAnnotation {
    const existing = this.annotations.get(checkpointId);
    const now = new Date();
    
    const annotation: CheckpointAnnotation = {
      checkpointId,
      notes,
      tags: existing?.tags || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    
    this.annotations.set(checkpointId, annotation);
    this.save();
    return annotation;
  }

  addTag(checkpointId: string, tag: string): CheckpointAnnotation {
    const existing = this.annotations.get(checkpointId);
    const now = new Date();
    
    const tags = existing?.tags || [];
    if (!tags.includes(tag)) tags.push(tag);
    
    const annotation: CheckpointAnnotation = {
      checkpointId,
      notes: existing?.notes || '',
      tags,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    
    this.annotations.set(checkpointId, annotation);
    this.save();
    return annotation;
  }

  removeTag(checkpointId: string, tag: string): boolean {
    const existing = this.annotations.get(checkpointId);
    if (!existing) return false;
    
    const idx = existing.tags.indexOf(tag);
    if (idx >= 0) {
      existing.tags.splice(idx, 1);
      existing.updatedAt = new Date();
      this.save();
      return true;
    }
    return false;
  }

  get(checkpointId: string): CheckpointAnnotation | undefined {
    return this.annotations.get(checkpointId);
  }

  getByTag(tag: string): CheckpointAnnotation[] {
    return Array.from(this.annotations.values()).filter(a => a.tags.includes(tag));
  }

  search(query: string): CheckpointAnnotation[] {
    const lower = query.toLowerCase();
    return Array.from(this.annotations.values()).filter(a => 
      a.notes.toLowerCase().includes(lower) ||
      a.tags.some(t => t.toLowerCase().includes(lower))
    );
  }

  delete(checkpointId: string): boolean {
    if (this.annotations.delete(checkpointId)) {
      this.save();
      return true;
    }
    return false;
  }

  listAll(): CheckpointAnnotation[] {
    return Array.from(this.annotations.values());
  }

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const ann of this.annotations.values()) {
      ann.tags.forEach(t => tags.add(t));
    }
    return Array.from(tags).sort();
  }
}

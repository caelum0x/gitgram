export interface AitmChangeStory {
  title?: string;
  checkpointId: string;
  fromCheckpointId?: string;
  aitmProjectId?: string;
  diffAdded: number;
  diffRemoved: number;
  diffModified: number;
  changedFiles: string[];
}

const START = '[AITM_CHANGE_STORY]';
const END = '[/AITM_CHANGE_STORY]';

export function parseAitmChangeStoryBlock(content: string): { story: AitmChangeStory | null; cleanContent: string } {
  if (!content || !content.includes(START) || !content.includes(END)) {
    return { story: null, cleanContent: content || '' };
  }

  const startIdx = content.indexOf(START);
  const endIdx = content.indexOf(END, startIdx);
  if (startIdx < 0 || endIdx < 0) {
    return { story: null, cleanContent: content };
  }

  const blockBody = content
    .slice(startIdx + START.length, endIdx)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const kv: Record<string, string> = {};
  for (const line of blockBody) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    kv[key] = value;
  }

  if (!kv.checkpointId) {
    return {
      story: null,
      cleanContent: (content.slice(0, startIdx) + content.slice(endIdx + END.length)).trim(),
    };
  }

  let files: string[] = [];
  if (kv.changedFiles) {
    try {
      const parsed = JSON.parse(kv.changedFiles);
      if (Array.isArray(parsed)) {
        files = parsed.map((f) => String(f)).filter(Boolean);
      }
    } catch {
      files = kv.changedFiles.split(',').map((f) => f.trim()).filter(Boolean);
    }
  }

  const story: AitmChangeStory = {
    title: kv.title || undefined,
    checkpointId: kv.checkpointId,
    fromCheckpointId: kv.fromCheckpointId || undefined,
    aitmProjectId: kv.aitmProjectId || undefined,
    diffAdded: Number(kv.diffAdded || 0),
    diffRemoved: Number(kv.diffRemoved || 0),
    diffModified: Number(kv.diffModified || 0),
    changedFiles: files,
  };

  const cleanContent = (content.slice(0, startIdx) + content.slice(endIdx + END.length)).trim();
  return { story, cleanContent };
}


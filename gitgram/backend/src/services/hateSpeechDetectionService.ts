import natural from 'natural';

const tokenizer = new natural.WordTokenizer();

const profanityList = ['fuck', 'shit', 'damn', 'bitch', 'ass', 'bastard', 'crap'];

const hateSpeechPatterns = [
  /\b(kill|murder|die|death)\s+(all|every)\s+\w+/i,
  /\b(hate|despise)\s+(all|every)\s+\w+/i,
  /\b(inferior|subhuman|animals?)\b/i,
];

const toxicWords = [
  'idiot', 'stupid', 'dumb', 'moron', 'retard', 'loser', 'trash', 'garbage',
  'scum', 'filth', 'disgusting', 'pathetic', 'worthless'
];

const isProfane = (text: string): boolean => {
  const lower = text.toLowerCase();
  return profanityList.some(word => lower.includes(word));
};

export const detectHateSpeech = (text: string): { isHateSpeech: boolean; score: number; reasons: string[] } => {
  const reasons: string[] = [];
  let score = 0;

  // Check profanity
  if (isProfane(text)) {
    score += 0.3;
    reasons.push('Contains profanity');
  }

  // Check hate speech patterns
  for (const pattern of hateSpeechPatterns) {
    if (pattern.test(text)) {
      score += 0.5;
      reasons.push('Contains hate speech pattern');
      break;
    }
  }

  // Check toxic words
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const toxicCount = tokens.filter(token => toxicWords.includes(token)).length;
  if (toxicCount > 0) {
    score += toxicCount * 0.2;
    reasons.push(`Contains ${toxicCount} toxic word(s)`);
  }

  // Check excessive caps (shouting)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.7 && text.length > 10) {
    score += 0.1;
    reasons.push('Excessive capitalization');
  }

  return {
    isHateSpeech: score >= 0.5,
    score: Math.min(score, 1),
    reasons
  };
};

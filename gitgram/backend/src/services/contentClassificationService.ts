import nlp from 'compromise';

export type ContentCategory = 'tech' | 'lifestyle' | 'business' | 'entertainment' | 'education' | 'news' | 'sports' | 'other';

interface Classification {
  category: ContentCategory;
  confidence: number;
  tags: string[];
}

const categoryKeywords: Record<ContentCategory, string[]> = {
  tech: ['code', 'programming', 'software', 'developer', 'api', 'database', 'algorithm', 'javascript', 'python', 'react', 'github', 'tech', 'computer', 'app', 'web'],
  lifestyle: ['food', 'travel', 'fashion', 'fitness', 'health', 'wellness', 'beauty', 'home', 'cooking', 'recipe', 'workout', 'yoga'],
  business: ['startup', 'entrepreneur', 'business', 'marketing', 'sales', 'revenue', 'profit', 'company', 'ceo', 'investment', 'funding'],
  entertainment: ['movie', 'music', 'game', 'gaming', 'film', 'show', 'series', 'actor', 'artist', 'concert', 'album'],
  education: ['learn', 'tutorial', 'course', 'education', 'teaching', 'study', 'university', 'school', 'lesson', 'training'],
  news: ['breaking', 'news', 'update', 'announcement', 'report', 'today', 'latest', 'current'],
  sports: ['football', 'basketball', 'soccer', 'tennis', 'sports', 'game', 'match', 'player', 'team', 'championship'],
  other: []
};

export const classifyContent = (text: string): Classification => {
  const doc = nlp(text);
  const lowerText = text.toLowerCase();
  
  const scores: Record<ContentCategory, number> = {
    tech: 0,
    lifestyle: 0,
    business: 0,
    entertainment: 0,
    education: 0,
    news: 0,
    sports: 0,
    other: 0
  };

  // Score based on keyword matches
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        scores[category as ContentCategory] += 1;
      }
    }
  }

  // Extract tags
  const tags: string[] = [];
  const topics = doc.topics().out('array');
  tags.push(...topics);

  const hashtags = text.match(/#\w+/g) || [];
  tags.push(...hashtags.map(tag => tag.slice(1)));

  // Determine category
  let maxScore = 0;
  let category: ContentCategory = 'other';
  
  for (const [cat, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      category = cat as ContentCategory;
    }
  }

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? maxScore / totalScore : 0;

  return {
    category,
    confidence,
    tags: [...new Set(tags)].slice(0, 10)
  };
};

export type RewriteLengthRange = {
  sourceLength: number;
  minimumLength: number;
  maximumLength: number;
  minimumChannels: number;
  maximumChannels: number;
  narrativeParagraphs: string;
  maxTokens: number;
};

export function unicodeTextLength(value: string) {
  return Array.from(value.replace(/\s/gu, "")).length;
}

export function rewriteLengthRange(source: string): RewriteLengthRange {
  const sourceLength = unicodeTextLength(source);
  let minimumLength: number;
  let maximumLength: number;
  let minimumChannels: number;
  let maximumChannels: number;
  let narrativeParagraphs: string;

  if (sourceLength <= 30) {
    minimumLength = 70;
    maximumLength = 150;
    minimumChannels = 2;
    maximumChannels = 2;
    narrativeParagraphs = "至少 1 段";
  } else if (sourceLength <= 80) {
    minimumLength = 120;
    maximumLength = 260;
    minimumChannels = 2;
    maximumChannels = 4;
    narrativeParagraphs = "1 至 2 段";
  } else if (sourceLength <= 200) {
    minimumLength = Math.max(150, Math.floor(sourceLength * 1.2));
    maximumLength = Math.ceil((sourceLength * 22) / 10);
    minimumChannels = 2;
    maximumChannels = 5;
    narrativeParagraphs = "1 至 3 段";
  } else if (sourceLength <= 500) {
    minimumLength = sourceLength;
    maximumLength = Math.ceil((sourceLength * 17) / 10);
    minimumChannels = 2;
    maximumChannels = 5;
    narrativeParagraphs = "2 至 4 段";
  } else {
    minimumLength = Math.floor((sourceLength * 85) / 100);
    maximumLength = Math.ceil((sourceLength * 135) / 100);
    minimumChannels = 2;
    maximumChannels = 6;
    narrativeParagraphs = "按原文自然分段；减少频道标签密度";
  }

  const maxTokens = Math.min(2600, Math.max(240, Math.ceil(maximumLength * 1.8) + 120));
  return { sourceLength, minimumLength, maximumLength, minimumChannels, maximumChannels, narrativeParagraphs, maxTokens };
}

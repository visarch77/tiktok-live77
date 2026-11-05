// Bộ câu hỏi nằm ở src/game/cau-hoi/*.txt (mỗi file 1 chủ đề, dòng đầu "# Tên chủ đề",
// dòng "> Đây là một món ăn." là câu cô nói trước gợi ý, áp cho mọi câu bên dưới tới dòng ">" kế tiếp).
// Mỗi dòng: ĐÁP ÁN | gợi ý | độ khó 1-3 | cách viết khác (cách nhau dấu phẩy)
// Kiểm tra cả bộ: npx tsx src/game/quiz.check.ts

export interface Question {
  id: string; // "tên-file:đáp án", dùng để nhớ câu đã hỏi
  clue: string;
  answer: string;
  acceptedAnswers?: string[];
  category: string;
  kind: string; // câu cô nói trước gợi ý, vd "Đây là một món ăn." (dòng "> ..." đầu file)
  difficulty: 'easy' | 'medium' | 'hard';
  /** câu toán nhẩm (math.ts): phép tính hiện trên bảng và cách cô đọc, không có trong file câu hỏi */
  math?: { show: string; say: string };
  /** câu có chỗ riêng trong tiết, theo đuôi tên file: "-meo" câu đố mẹo, "-su" câu lịch sử.
   *  Chỉ hỏi ở đúng vị trí đó trong GAME.roundPlan, không lẫn vào câu chữ thường */
  slot?: Slot;
}

const LEVEL = { '1': 'easy', '2': 'medium', '3': 'hard' } as const;

export const SLOTS = ['meo', 'su', 'anh'] as const;
export type Slot = (typeof SLOTS)[number];

/** Đọc các file câu hỏi. `errors` gom dòng sai cú pháp để script kiểm tra báo ra */
export function parseBank(files: Record<string, string>, errors: string[] = []): Question[] {
  const out: Question[] = [];
  for (const [path, text] of Object.entries(files)) {
    const file = path.split('/').pop()!.replace(/\.txt$/, '');
    let category = file;
    let kind = '';
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      if (line.startsWith('#')) {
        if (category === file) category = line.slice(1).trim();
        return;
      }
      if (line.startsWith('>')) {
        kind = line.slice(1).trim();
        return;
      }
      const [answer, clue, level, alts] = line.split('|').map((s) => s.trim());
      const difficulty = LEVEL[level as keyof typeof LEVEL];
      if (!answer || !clue || !difficulty) {
        errors.push(`${file}:${i + 1} sai cú pháp: ${line}`);
        return;
      }
      out.push({
        id: `${file}:${answer}`,
        answer,
        clue,
        category,
        kind,
        difficulty,
        slot: SLOTS.find((s) => file.endsWith(`-${s}`)),
        acceptedAnswers: alts ? alts.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      });
    });
  }
  return out;
}

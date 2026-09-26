/** A notebook_notes row as returned by the notebook server actions. */
export interface Note {
  id: number;
  roomId: number;
  userId: number;
  categoryId: number | null;
  title: string;
  content: string;
  /** Sender's display-name snapshot when this note is a received copy (else null). */
  sourceName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A notebook_categories row. */
export interface Category {
  id: number;
  roomId: number;
  userId: number;
  name: string;
  color: string;
  createdAt: string;
}

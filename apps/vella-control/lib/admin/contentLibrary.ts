export type ContentItemType = "persona" | "script" | "template" | "story" | "habit" | "emotion";

export type ContentLibraryItemConfig = {
  type: ContentItemType;
  body: string;
  tags?: string[];
  metadata?: Record<string, any>;
};

export type ContentLibraryItem = {
  id: string;
  label: string;
  is_active: boolean;
  config: ContentLibraryItemConfig;
  created_at?: string;
  updated_at?: string;
};


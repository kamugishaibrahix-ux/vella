DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.get_forbidden_content_keys()
  RETURNS text[] AS $fn$
  BEGIN
    RETURN ARRAY[
      'content', 'text', 'message', 'note', 'body', 'journal', 'reflection',
      'summary', 'transcript', 'prompt', 'response', 'narrative', 'description',
      'comment', 'entry', 'reply', 'answer', 'reasoning', 'free_text',
      'detail', 'details', 'context', 'notes', 'note_text', 'caption',
      'content_text', 'contentText', 'user_input', 'assistant_output',
      'input', 'output', 'raw', 'payload', 'message_text', 'full_text'
    ];
  END;
  $fn$ LANGUAGE plpgsql IMMUTABLE;
END $$;

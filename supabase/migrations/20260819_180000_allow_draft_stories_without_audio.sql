-- Between Stops: allow route planning before Story audio is recorded.
-- Submission remains protected by submit_experience_for_review(), which
-- rejects any tour containing a Story without an audio file.

alter table public.stories
  alter column audio_path drop not null,
  alter column audio_filename drop not null,
  alter column audio_mime_type drop not null,
  alter column audio_size_bytes drop not null;

comment on column public.stories.audio_path is
  'Optional while an experience is a draft; required before submission.';

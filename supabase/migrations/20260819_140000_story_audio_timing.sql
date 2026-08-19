-- Between Stops: store measured Story audio duration for approach timing.

alter table public.stories
  add column if not exists audio_duration_seconds numeric(8, 1)
  check (
    audio_duration_seconds is null
    or audio_duration_seconds > 0
  );

comment on column public.stories.audio_duration_seconds is
  'Browser-measured duration of the uploaded Story audio, used to calculate a direction-aware approach trigger.';

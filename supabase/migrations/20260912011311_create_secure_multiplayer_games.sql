create extension if not exists pgcrypto;

create table public.multiplayer_games (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  status text not null default 'waiting',
  public_state jsonb not null default '{}'::jsonb,
  authoritative_state jsonb not null default '{}'::jsonb,
  state_version bigint not null default 0,
  turn text not null default 'white',
  winner text,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint multiplayer_games_join_code_check check (join_code ~ '^[A-Z2-9]{5}$'),
  constraint multiplayer_games_status_check check (status = any (array['waiting'::text, 'active'::text, 'finished'::text, 'abandoned'::text])),
  constraint multiplayer_games_turn_check check (turn = any (array['white'::text, 'black'::text])),
  constraint multiplayer_games_winner_check check (winner = any (array['white'::text, 'black'::text]) or winner is null)
);

create table public.multiplayer_players (
  game_id uuid not null,
  side text not null,
  token_hash text not null,
  connected boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (game_id, side),
  constraint multiplayer_players_side_check check (side = any (array['white'::text, 'black'::text])),
  constraint multiplayer_players_game_id_fkey foreign key (game_id)
    references public.multiplayer_games (id) on delete cascade,
  constraint multiplayer_players_game_id_token_hash_key unique (game_id, token_hash)
);

create index multiplayer_games_join_code_idx on public.multiplayer_games using btree (join_code);
create index multiplayer_players_token_hash_idx on public.multiplayer_players using btree (token_hash);

alter table public.multiplayer_games enable row level security;
alter table public.multiplayer_players enable row level security;

create policy multiplayer_games_public_read
  on public.multiplayer_games
  as permissive
  for select
  to anon, authenticated
  using (true);

alter publication supabase_realtime add table public.multiplayer_games;

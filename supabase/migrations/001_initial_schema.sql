-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Households (nucleo familiare)
create table households (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Casa',
  user_a_id uuid references auth.users(id),
  user_b_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  household_id uuid references households(id),
  created_at timestamptz default now()
);

-- Categories with split rule
create table categories (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  icon text default '💰',
  color text default '#6366f1',
  split_type text not null check (split_type in ('personal', 'shared')),
  split_ratio float default 0.5,
  created_at timestamptz default now()
);

-- Expenses
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  paid_by uuid references auth.users(id),
  category_id uuid references categories(id),
  amount decimal(10,2) not null,
  description text,
  date date not null default current_date,
  is_recurring boolean default false,
  recurring_expense_id uuid,
  receipt_url text,
  notes text,
  created_at timestamptz default now()
);

-- Recurring expense templates
create table recurring_expenses (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  category_id uuid references categories(id),
  paid_by uuid references auth.users(id),
  amount decimal(10,2) not null,
  description text not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_due date not null,
  auto_create boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

-- Bills with due dates
create table bills (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  category_id uuid references categories(id),
  name text not null,
  amount decimal(10,2),
  due_day int not null check (due_day between 1 and 31),
  reminder_days_before int default 3,
  last_paid_date date,
  active boolean default true,
  created_at timestamptz default now()
);

-- Household invites
create table household_invites (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  invited_email text not null,
  token text unique not null,
  accepted boolean default false,
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now()
);

-- Enable RLS on all tables
alter table households enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table expenses enable row level security;
alter table recurring_expenses enable row level security;
alter table bills enable row level security;
alter table household_invites enable row level security;

-- RLS Policies: users only see their own household
create policy "household_access" on households
  for all using (
    auth.uid() = user_a_id or auth.uid() = user_b_id
  );

create policy "profile_own_access" on profiles
  for all using (auth.uid() = id);

create policy "category_household_access" on categories
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

create policy "expense_household_access" on expenses
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

create policy "recurring_household_access" on recurring_expenses
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

create policy "bills_household_access" on bills
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

create policy "invite_household_access" on household_invites
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

-- Trigger: auto-create profile after Google OAuth signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

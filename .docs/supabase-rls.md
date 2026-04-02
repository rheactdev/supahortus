# Row Level Security

Secure your data using Postgres Row Level Security.

When you need granular authorization rules, nothing beats Postgres's [Row Level Security (RLS)](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Row Level Security in Supabase

Supabase allows convenient and secure data access from the browser, as long as you enable RLS.

RLS _must_ always be enabled on any tables stored in an exposed schema. By default, this is the `public` schema.

RLS is enabled by default on tables created with the Table Editor in the dashboard. If you create one in raw SQL or with the SQL editor, remember to enable RLS yourself:

```sql
alter table <schema_name>.<table_name>
enable row level security;
```

RLS is incredibly powerful and flexible, allowing you to write complex SQL rules that fit your unique business needs. RLS can be combined with [Supabase Auth](/docs/guides/auth) for end-to-end user security from the browser to the database.

RLS is a Postgres primitive and can provide "[defense in depth](<https://en.wikipedia.org/wiki/Defense_in_depth_(computing)>)" to protect your data from malicious actors even when accessed through third-party tooling.

## Policies

[Policies](https://www.postgresql.org/docs/current/sql-createpolicy.html) are Postgres's rule engine. Policies are easy to understand once you get the hang of them. Each policy is attached to a table, and the policy is executed every time a table is accessed.

You can just think of them as adding a `WHERE` clause to every query. For example a policy like this ...

```sql
create policy "Individuals can view their own todos."
on todos for select
using ( (select auth.uid()) = user_id );
```

.. would translate to this whenever a user tries to select from the todos table:

```sql
select *
from todos
where auth.uid() = todos.user_id;
-- Policy is implicitly added.
```

## Enabling Row Level Security

You can enable RLS for any table using the `enable row level security` clause:

```sql
alter table "table_name" enable row level security;
```

Once you have enabled RLS, no data will be accessible via the [API](/docs/guides/api) when using the public `anon` key, until you create policies.

## Auto-enable RLS for new tables

If you want RLS enabled automatically for new tables, you can create an event trigger that runs after table creation. This uses a Postgres [event trigger](/docs/guides/database/postgres/event-triggers) to call `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on each newly created table.

```sql
CREATE OR REPLACE FUNCTION rls_auto_enable()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
EXECUTE FUNCTION rls_auto_enable();
```

Note that this applies to tables created after the trigger is installed. Existing tables still need RLS enabled manually.

When a request is made without an authenticated user (e.g., no access token is provided or the session has expired), `auth.uid()` returns `null`.

This means that a policy like:

```sql
USING (auth.uid() = user_id)
```

will silently fail for unauthenticated users, because:

```sql
null = user_id
```

is always false in SQL.

To avoid confusion and make your intention clear, we recommend explicitly checking for authentication:

```sql
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
```

## Authenticated and unauthenticated roles

Supabase maps every request to one of the roles:

- `anon`: an unauthenticated request (the user is not logged in)
- `authenticated`: an authenticated request (the user is logged in)

These are actually [Postgres Roles](/docs/guides/database/postgres/roles). You can use these roles within your Policies using the `TO` clause:

```sql
create policy "Profiles are viewable by everyone"
on profiles for select
to authenticated, anon
using ( true );

-- OR

create policy "Public profiles are viewable only by authenticated users"
on profiles for select
to authenticated
using ( true );
```

Using the `anon` Postgres role is different from an [anonymous user](/docs/guides/auth/auth-anonymous) in Supabase Auth. An anonymous user assumes the `authenticated` role to access the database and can be differentiated from a permanent user by checking the `is_anonymous` claim in the JWT.

## Creating policies

Policies are SQL logic that you attach to a Postgres table. You can attach as many policies as you want to each table.

Supabase provides some [helpers](#helper-functions) that simplify RLS if you're using Supabase Auth. We'll use these helpers to illustrate some basic policies:

### SELECT policies

You can specify select policies with the `using` clause.

Let's say you have a table called `profiles` in the public schema and you want to enable read access to everyone.

```sql
-- 1. Create table
create table profiles (
  id uuid primary key,
  user_id uuid references auth.users,
  avatar_url text
);

-- 2. Enable RLS
alter table profiles enable row level security;

-- 3. Create Policy
create policy "Public profiles are visible to everyone."
on profiles for select
to anon         -- the Postgres Role (recommended)
using ( true ); -- the actual Policy
```

Alternatively, if you only wanted users to be able to see their own profiles:

```sql
create policy "User can see their own profile only."
on profiles
for select using ( (select auth.uid()) = user_id );
```

### INSERT policies

You can specify insert policies with the `with check` clause. The `with check` expression ensures that any new row data adheres to the policy constraints.

Let's say you have a table called `profiles` in the public schema and you only want users to be able to create a profile for themselves. In that case, we want to check their User ID matches the value that they are trying to insert:

```sql
-- 1. Create table
create table profiles (
  id uuid primary key,
  user_id uuid references auth.users,
  avatar_url text
);

-- 2. Enable RLS
alter table profiles enable row level security;

-- 3. Create Policy
create policy "Users can create a profile."
on profiles for insert
to authenticated                          -- the Postgres Role (recommended)
with check ( (select auth.uid()) = user_id );      -- the actual Policy
```

### UPDATE policies

You can specify update policies by combining both the `using` and `with check` expressions.

The `using` clause represents the condition that must be true for the update to be allowed, and `with check` clause ensures that the updates made adhere to the policy constraints.

Let's say you have a table called `profiles` in the public schema and you only want users to be able to update their own profile.

You can create a policy where the `using` clause checks if the user owns the profile being updated. And the `with check` clause ensures that, in the resultant row, users do not change the `user_id` to a value that is not equal to their User ID, maintaining that the modified profile still meets the ownership condition.

```sql
-- 1. Create table
create table profiles (
  id uuid primary key,
  user_id uuid references auth.users,
  avatar_url text
);

-- 2. Enable RLS
alter table profiles enable row level security;

-- 3. Create Policy
create policy "Users can update their own profile."
on profiles for update
to authenticated                    -- the Postgres Role (recommended)
using ( (select auth.uid()) = user_id )       -- checks if the existing row complies with the policy expression
with check ( (select auth.uid()) = user_id ); -- checks if the new row complies with the policy expression
```

If no `with check` expression is defined, then the `using` expression will be used both to determine which rows are visible (normal USING case) and which new rows will be allowed to be added (WITH CHECK case).

To perform an `UPDATE` operation, a corresponding [`SELECT` policy](#select-policies) is required. Without a `SELECT` policy, the `UPDATE` operation will not work as expected.

### DELETE policies

You can specify delete policies with the `using` clause.

Let's say you have a table called `profiles` in the public schema and you only want users to be able to delete their own profile:

```sql
-- 1. Create table
create table profiles (
  id uuid primary key,
  user_id uuid references auth.users,
  avatar_url text
);

-- 2. Enable RLS
alter table profiles enable row level security;

-- 3. Create Policy
create policy "Users can delete a profile."
on profiles for delete
to authenticated                     -- the Postgres Role (recommended)
using ( (select auth.uid()) = user_id );      -- the actual Policy
```

### Views

Views bypass RLS by default because they are usually created with the `postgres` user. This is a feature of Postgres, which automatically creates views with `security definer`.

In Postgres 15 and above, you can make a view obey the RLS policies of the underlying tables when invoked by `anon` and `authenticated` roles by setting `security_invoker = true`.

```sql
create view 
with(security_invoker = true)
as select 
```

In older versions of Postgres, protect your views by revoking access from the `anon` and `authenticated` roles, or by putting them in an unexposed schema.

## Helper functions

Supabase provides some helper functions that make it easier to write Policies.

### `auth.uid()`

Returns the ID of the user making the request.

### `auth.jwt()`

Not all information present in the JWT should be used in RLS policies. For instance, creating an RLS policy that relies on the `user_metadata` claim can create security issues in your application as this information can be modified by authenticated end users.

Returns the JWT of the user making the request. Anything that you store in the user's `raw_app_meta_data` column or the `raw_user_meta_data` column will be accessible using this function. It's important to know the distinction between these two:

- `raw_user_meta_data` - can be updated by the authenticated user using the `supabase.auth.update()` function. It is not a good place to store authorization data.
- `raw_app_meta_data` - cannot be updated by the user, so it's a good place to store authorization data.

The `auth.jwt()` function is extremely versatile. For example, if you store some team data inside `app_metadata`, you can use it to determine whether a particular user belongs to a team. For example, if this was an array of IDs:

```sql
create policy "User is in team"
on my_table
to authenticated
using ( team_id in (select auth.jwt() -> 'app_metadata' -> 'teams'));
```

Keep in mind that a JWT is not always "fresh". In the example above, even if you remove a user from a team and update the `app_metadata` field, that will not be reflected using `auth.jwt()` until the user's JWT is refreshed.

Also, if you are using Cookies for Auth, then you must be mindful of the JWT size. Some browsers are limited to 4096 bytes for each cookie, and so the total size of your JWT should be small enough to fit inside this limitation.

### MFA

The `auth.jwt()` function can be used to check for [Multi-Factor Authentication](/docs/guides/auth/auth-mfa#enforce-rules-for-mfa-logins). For example, you could restrict a user from updating their profile unless they have at least 2 levels of authentication (Assurance Level 2):

```sql
create policy "Restrict updates."
on profiles
as restrictive
for update
to authenticated using (
  (select auth.jwt()->>'aal') = 'aal2'
);
```

## Bypassing Row Level Security

Supabase provides special "Service" keys, which can be used to bypass RLS. These should never be used in the browser or exposed to customers, but they are useful for administrative tasks.

Supabase will adhere to the RLS policy of the signed-in user, even if the client library is initialized with a Service Key.

You can also create new [Postgres Roles](/docs/guides/database/postgres/roles) which can bypass Row Level Security using the "bypass RLS" privilege:

```sql
alter role "role_name" with bypassrls;
```

This can be useful for system-level access. You should _never_ share login credentials for any Postgres Role with this privilege.

## RLS performance recommendations

Every authorization system has an impact on performance. While row level security is powerful, the performance impact is important to keep in mind. This is especially true for queries that scan every row in a table - like many `select` operations, including those using limit, offset, and ordering.

Based on a series of [tests](https://github.com/GaryAustin1/RLS-Performance), we have a few recommendations for RLS:

### Add indexes

Make sure you've added [indexes](/docs/guides/database/postgres/indexes) on any columns used within the Policies which are not already indexed (or primary keys). For a Policy like this:

```sql
create policy "rls_test_select" on test_table
to authenticated
using ( (select auth.uid()) = user_id );
```

You can add an index like:

```sql
create index userid
on test_table
using btree (user_id);
```

#### Benchmarks

| Test                                                                                          | Before (ms) | After (ms) | % Improvement | Change                                                                                                   |
| --------------------------------------------------------------------------------------------- | ----------- | ---------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| [test1-indexed](https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test1-indexed) | 171         | < 0.1      | 99.94%        | <details className="cursor-pointer">Before:<br/>No index<br/><br/>After:<br/>`user_id` indexed</details> |

### Call functions with `select`

You can use `select` statement to improve policies that use functions. For example, instead of this:

```sql
create policy "rls_test_select" on test_table
to authenticated
using ( auth.uid() = user_id );
```

You can do:

```sql
create policy "rls_test_select" on test_table
to authenticated
using ( (select auth.uid()) = user_id );
```

This method works well for JWT functions like `auth.uid()` and `auth.jwt()` as well as `security definer` Functions. Wrapping the function causes an `initPlan` to be run by the Postgres optimizer, which allows it to "cache" the results per-statement, rather than calling the function on each row.

You can only use this technique if the results of the query or function do not change based on the row data.

#### Benchmarks

| Test                                                                                                                              | Before (ms) | After (ms) | % Improvement | Change                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [test2a-wrappedSQL-uid](<https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test2a-wrappedSQL-uid()>)                 | 179         | 9          | 94.97%        | <details className="cursor-pointer">Before:<br/>`auth.uid() = user_id` <br/><br/>After:<br/> `(select auth.uid()) = user_id`</details>                                    |
| [test2b-wrappedSQL-isadmin](<https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test2b-wrappedSQL-isadmin()>)         | 11,000      | 7          | 99.94%        | <details className="cursor-pointer">Before:<br/>`is_admin()` _table join_<br/><br/>After:<br/>`(select is_admin())` _table join_</details>                                |
| [test2c-wrappedSQL-two-functions](https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test2c-wrappedSQL-two-functions) | 11,000      | 10         | 99.91%        | <details className="cursor-pointer">Before:<br/>`is_admin() OR auth.uid() = user_id`<br/><br/>After:<br/>`(select is_admin()) OR (select auth.uid() = user_id)`</details> |
| [test2d-wrappedSQL-sd-fun](https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test2d-wrappedSQL-sd-fun)               | 178,000     | 12         | 99.993%       | <details className="cursor-pointer">Before:<br/>`has_role() = role` <br/><br/>After:<br/>(select has_role()) = role</details>                                             |
| [test2e-wrappedSQL-sd-fun-array](https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test2e-wrappedSQL-sd-fun-array)   | 173000      | 16         | 99.991%       | <details className="cursor-pointer">Before:<br/>`team_id=any(user_teams())` <br/><br/>After:<br/>team_id=any(array(select user_teams()))</details>                        |

### Add filters to every query

Policies are "implicit where clauses," so it's common to run `select` statements without any filters. This is a bad pattern for performance. Instead of doing this (JS client example):

```js
const { data } = supabase
  .from('table')
  .select()
```

You should always add a filter:

```js
const { data } = supabase
  .from('table')
  .select()
  .eq('user_id', userId)
```

Even though this duplicates the contents of the Policy, Postgres can use the filter to construct a better query plan.

#### Benchmarks

| Test                                                                                              | Before (ms) | After (ms) | % Improvement | Change                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ----------- | ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [test3-addfilter](https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test3-addfilter) | 171         | 9          | 94.74%        | <details className="cursor-pointer">Before:<br/>`auth.uid() = user_id`<br/><br/>After:<br/>add `.eq` or `where` on `user_id`</details> |

### Use security definer functions

A "security definer" function runs using the same role that _created_ the function. This means that if you create a role with a superuser (like `postgres`), then that function will have `bypassrls` privileges. For example, if you had a policy like this:

```sql
create policy "rls_test_select" on test_table
to authenticated
using (
  exists (
    select 1 from roles_table
    where (select auth.uid()) = user_id and role = 'good_role'
  )
);
```

We can instead create a `security definer` function which can scan `roles_table` without any RLS penalties:

```sql
create function private.has_good_role()
returns boolean
language plpgsql
security definer -- will run as the creator
as $$
begin
  return exists (
    select 1 from roles_table
    where (select auth.uid()) = user_id and role = 'good_role'
  );
end;
$$;

-- Update our policy to use this function:
create policy "rls_test_select"
on test_table
to authenticated
using ( (select private.has_good_role()) );
```

Security-definer functions should never be created in a schema in the "Exposed schemas" inside your [API settings](/dashboard/project/_/settings/api)`.

### Minimize joins

You can often rewrite your Policies to avoid joins between the source and the target table. Instead, try to organize your policy to fetch all the relevant data from the target table into an array or set, then you can use an `IN` or `ANY` operation in your filter.

For example, this is an example of a slow policy which joins the source `test_table` to the target `team_user`:

```sql
create policy "rls_test_select" on test_table
to authenticated
using (
  (select auth.uid()) in (
    select user_id
    from team_user
    where team_user.team_id = team_id -- joins to the source "test_table.team_id"
  )
);
```

We can rewrite this to avoid this join, and instead select the filter criteria into a set:

```sql
create policy "rls_test_select" on test_table
to authenticated
using (
  team_id in (
    select team_id
    from team_user
    where user_id = (select auth.uid()) -- no join
  )
);
```

In this case you can also consider [using a `security definer` function](#use-security-definer-functions) to bypass RLS on the join table:

If the list exceeds 1000 items, a different approach may be needed or you may need to analyze the approach to ensure that the performance is acceptable.

#### Benchmarks

| Test                                                                                                | Before (ms) | After (ms) | % Improvement | Change                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ----------- | ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [test5-fixed-join](https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test5-fixed-join) | 9,000       | 20         | 99.78%        | <details className="cursor-pointer">Before:<br/>`auth.uid()` in table join on col<br/><br/>After:<br/>col in table join on `auth.uid()`</details> |

### Specify roles in your policies

Always use the Role of inside your policies, specified by the `TO` operator. For example, instead of this query:

```sql
create policy "rls_test_select" on rls_test
using ( auth.uid() = user_id );
```

Use:

```sql
create policy "rls_test_select" on rls_test
to authenticated
using ( (select auth.uid()) = user_id );
```

This prevents the policy `( (select auth.uid()) = user_id )` from running for any `anon` users, since the execution stops at the `to authenticated` step.

#### Benchmarks

| Test                                                                                          | Before (ms) | After (ms) | % Improvement | Change                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ----------- | ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [test6-To-role](https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/test6-To-role) | 170         | < 0.1      | 99.78%        | <details className="cursor-pointer">Before:<br/>No `TO` policy<br/><br/>After:<br/>`TO authenticated` (anon accessing)</details> |

---
_This is a copy of a troubleshooting article on Supabase's docs site. It may be missing some details from the original. View the [original article](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)._

## RLS performance and best practices

Although most of the time spent on thinking about RLS is to get it to handle security needs, the impact of it on performance of your queries can be massive.
This is especially true on queries that look at every row in a table like for many select operations and updates.
Note that queries that use limit and offset will usually have to query all rows to determine order, not just the limit amount so they are impacted too.

See the last section for ways to measure the performance of your queries as you test RLS improvements.

### Is RLS causing performance issues (on a single table query)?

For very slow queries, or if using the tools at end of article, run a query with RLS enabled on the table and then with it disabled (this should only be done in a non production environment). If the results are similar then your query itself is likely the performance issue. Although, remember any join tables in RLS will also need to run their RLS unless a security definer function is used to bypass them. You can also create a service\_role client to run the query bypassing RLS if in a secure environment.

### How to improve RLS performance.

The following tips are very broad and each may or may not help the specific case involved. Some changes, like adding indexes, should be backed out if they do not make a difference in RLS performance and you are not using them for filtering performance.

#### 1. The first thing to try is put an index on columns used in the RLS that are not primary keys or unique already.

For RLS like:
`auth.uid() = user_id`
Add an index like:
`create index userid on test_table using btree (user_id) tablespace pg_default;`
Improvement seen over 100x on large tables.

#### 2. Another method to improve performance is to wrap your RLS queries and functions in select statements.

This method works well for JWT functions like `auth.uid()` and `auth.jwt()` as well as any other functions including security definer type.
Wrapping the function in some SQL causes an `initPlan` to be run by the optimizer which allows it to "cache" the results versus calling the function
on each row.
WARNING: You can only do this if the results of the query or function do not change based on the row data.
For RLS like this:
`is_admin() or auth.uid() = user_id`
Use this instead:
`(select is_admin()) OR (select auth.uid()) = user_id`

#### 3. Do not rely on RLS for filtering but only for security.

Instead of doing this (JS client example):
`.from('table').select()`
With an RLS policy of:
`auth.uid() = user_id`
Add a filter in addition to the RLS:
`.from('table').select().eq('user_id',userId)`

#### 4. Use security definer functions to do queries on other tables to bypass their RLS when possible.

Instead of having this RLS where the roles\_table has an RLS select policy of `auth.uid() = user_id`:
`exists (select 1 from roles_table where auth.uid() = user_id and role = 'good_role')`
Create a security definer function has\_role() and do:
`(select has_role())` with code of `exists (select 1 from roles_table where auth.uid() = user_id and role = 'good_role')`
Note that you should wrap your security definer function in select if it is a fixed value per 2.
Remember functions you use in RLS can be called from the API.
Secure your functions in an alternate schema if their results would be a security leak.
Warning: If your security definer function uses row information as an input parameter be sure to test performance as you can't wrap the function as in 2.

#### 5. Always optimize join queries to compare row columns to fixed join data.

Instead of querying on a row column in a join table WHERE, organize your query to get all
the column values that meet your query into an array or set.
Then use an IN or ANY operation to filter against the row column.
This RLS to allow select only for rows where the team\_id is one the user has access to:
`auth.uid() in (select user_id from team_user where team_user.team_id = table.team_id)`
will be much slower than:
`team_id in (select team_id from team_user where user_id = auth.uid())`
Also consider moving the join query to a security definer function to avoid RLS on join table:
`team_id in (select user_teams())`
Note that if the `in` list gets to be over 10K items, then extra analysis is likely needed. See this follow up testing: <https://github.com/GaryAustin1/RLS-Performance/tree/main/tests/Supabase-Docs-Test> .

#### 6. Use role in TO option or roles dropdown in the dashboard.

Never just use RLS involving `auth.uid()` or `auth.jwt()` as your way to rule out 'anon' role.
Always add 'authenticated' to the approved roles instead of nothing or public.
Although this does not improve the query performance for the signed in user it does
eliminate 'anon' users without taxing the database to process the rest of the RLS.

### Sample results

The code used for the below tests can be found here: [LINK](https://github.com/GaryAustin1/RLS-Perfomance):
The tests are doing selects on a 100K row table. Some have an additional join table.

Show RLS and before after for above examples.

| Test | RLS Before                         | RLS After                                            | SQL     | SQL |
| ---- | ---------------------------------- | ---------------------------------------------------- | ------- | --- |
| 1    | auth.uid()=user\_id                | user\_id indexed                                     | 171ms   | <.1 |
| 2a   | auth.uid()=user\_id                | (select auth.uid()) = user\_id                       | 179     | 9   |
| 2b   | is*admin() \_table join*           | (select is*admin()) \_table join*                    | 11,000  | 7   |
| 2c   | is\_admin() OR auth.uid()=user\_id | (select is\_admin()) OR (select auth.uid()=user\_id) | 11,000  | 10  |
| 2d   | has\_role()=role                   | (select has\_role())=role                            | 178,000 | 12  |
| 2e   | team\_id=any(user\_teams())        | team\_id=any(array(select user\_teams()))            | 173000  | 16  |
| 3    | auth.uid()=user\_id                | add .eq or where on user\_id                         | 171     | 9   |
| 5    | auth.uid() in *table join on col*  | col in *table join on auth.uid()*                    | 9,000   | 20  |
| 6    | No TO policy                       | TO authenticated (anon accessing)                    | 170     | <.1 |

### Tools to measure performance

Postgres has tools to analyze the performance of queries. <https://www.postgresql.org/docs/current/sql-explain.html>
The use of explain in detail for query analysis is beyond the scope of this discussion.
Here we will use it mainly to get a performance metric to compare times.
In order to do RLS testing you need to setup the user JWT claims and change the running user to `anon` or `authenticated`.

```sql
set session role authenticated;
set request.jwt.claims to '{"role":"authenticated", "sub":"5950b438-b07c-4012-8190-6ce79e4bd8e5"}';

explain analyze SELECT count(*) FROM rlstest;
set session role postgres;
```

This will return results like:

    Seq Scan on rlstest  (cost=0.00..4334.00 rows=1 width=35) (actual time=170.999..170.999 rows=0 loops=1)
    "  Filter: ((COALESCE(NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text), ((NULLIF(current_setting('request.jwt.claims'::text, true), ''::text))::jsonb ->> 'sub'::text)))::uuid = user_id)"
      Rows Removed by Filter: 100000
    Planning Time: 0.216 ms
    Execution Time: 171.033 ms

In this case the execution time is the critical number we need to compare.

PostgREST allows use of explain to get performance information on your queries with Supabase clients.

Before using this feature you need to run the following command in the Dashboard SQL editor (should not be used in production):

```sql
alter role authenticator set pgrst.db_plan_enabled to true;
NOTIFY pgrst, 'reload config';
```

Then you can use the .explain() modifier to get performance metrics.

```js
const { data, error } = await supabase
  .from('projects')
  .select('*')
  .eq('id', 1)
  .explain({ analyze: true })

console.log(data)
```

This will return a result like:

    Aggregate  (cost=8.18..8.20 rows=1 width=112) (actual time=0.017..0.018 rows=1 loops=1)
      ->  Index Scan using projects_pkey on projects  (cost=0.15..8.17 rows=1 width=40) (actual time=0.012..0.012 rows=0 loops=1)
            Index Cond: (id = 1)
            Filter: false
            Rows Removed by Filter: 1
    Planning Time: 0.092 ms
    Execution Time: 0.046 ms

\*These two GitHub discussions cover the history that lead to this analysis...

[Stable functions do not seem to be honored in RLS in basic form](https://github.com/orgs/supabase/discussions/9311)
[current\_setting can lead to bad performance when used on RLS](https://github.com/PostgREST/postgrest-docs/issues/609#)

Thanks Steve Chavez and Wolfgang Walther in those threads.

### Added example of security definer function having select of a team table, comparing against a column in main table

The example is in the test data as test2f.
In this case we start with a 1M row table with a team\_id column.
We have a 1000 row team table that has user\_ids and team(s) they belong too.
Basic RLS for a select would be `team_id = ANY(user_teams())`
This case times out with over 3 minutes as 1M rows must be searched and the function is run each time on 1000 rows.
Changing to wrap the function (method 2) `team_id = ANY(ARRAY(select user_teams()))` is a big improvement but can still take seconds.
Adding an index to team\_id is the big win, but only with the second case. Without, the index case still times out.

Some results:

| Policy                            | Index | Main Rs | Team Rs | on 10 teams | 100   | 500   | note               |
| --------------------------------- | ----- | ------- | ------- | ----------- | ----- | ----- | ------------------ |
| =ANY(user\_teams())               | no    | 1M      | 1000    | >2Min       | >2Min | >2Min | TO or killed       |
| =ANY(user\_teams())               | yes   | 1M      | 1000    | >2Min       | >2Min | >2Min | TO or killed       |
| =ANY(ARRAY(select user\_teams())) | no    | 1M      | 1000    | 170ms       | 700   | 3300  |                    |
| =ANY(ARRAY(select user\_teams())) | yes   | 1M      | 1000    | 2ms         | 3     | 3     |                    |
| in(1,2,3...100)                   | no    | 1M      | NA      | 130ms       | 142   | x     | baseline check     |
| =ANY(ARRAY(select user\_teams())) | yes   | 1M      | 10K     | x           | x     | x     | 24ms (on 1K teams) |

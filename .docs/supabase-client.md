# Creating a Supabase client for SSR

Configure your Supabase client to use cookies

To use Server-Side Rendering (SSR) with Supabase, you need to configure your Supabase client to use cookies. The `@supabase/ssr` package helps you do this for JavaScript/TypeScript applications.

## Install

Install the `@supabase/supabase-js` and `@supabase/ssr` helper packages:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

```bash
yarn add @supabase/supabase-js @supabase/ssr
```

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

## Set environment variables

Create a `.env.local` file in the project root directory. In the file, set the project's Supabase URL and Key:

You can also get the Project URL and key from [the project's **Connect** dialog](/dashboard/project/\_?showConnect=true&connectTab={{ .tab }}&framework={{ .framework }}).

Supabase is changing the way keys work to improve project security and developer experience. You can [read the full announcement](https://github.com/orgs/supabase/discussions/29260), but in the transition period, you can use both the current `anon` and `service_role` keys and the new publishable key with the form `sb_publishable_xxx` which will replace the older keys.

In most cases, you can get the correct key from [the Project's **Connect** dialog](/dashboard/project/\_?showConnect=true&connectTab={{ .tab }}&framework={{ .framework }}), but if you want a specific key, you can find all keys in [the API Keys section of a Project's Settings page](/dashboard/project/_/settings/api-keys/):

- **For legacy keys**, copy the `anon` key for client-side operations and the `service_role` key for server-side operations from the **Legacy API Keys** tab.
- **For new keys**, open the **API Keys** tab, if you don't have a publishable key already, click **Create new API Keys**, and copy the value from the **Publishable key** section.

[Read the API keys docs](/docs/guides/api/api-keys) for a full explanation of all key types and their uses.

```bash .env.local
NEXT_PUBLIC_SUPABASE_URL=supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=supabase_publishable_key
```

```bash .env.local
PUBLIC_SUPABASE_URL=supabase_project_url
PUBLIC_SUPABASE_PUBLISHABLE_KEY=supabase_publishable_key
```

```bash .env
PUBLIC_SUPABASE_URL=supabase_project_url
PUBLIC_SUPABASE_PUBLISHABLE_KEY=supabase_publishable_key
```

```bash .env
SUPABASE_URL=supabase_project_url
SUPABASE_PUBLISHABLE_KEY=supabase_publishable_key
```

```bash .env
SUPABASE_URL=supabase_project_url
SUPABASE_PUBLISHABLE_KEY=supabase_publishable_key
```

```bash .env
SUPABASE_URL=supabase_project_url
SUPABASE_PUBLISHABLE_KEY=supabase_publishable_key
```

Install [dotenv](https://www.npmjs.com/package/dotenv):

```bash
npm i dotenv
```

And initialize it:

```bash
npm install dotenv
```

```bash
yarn add dotenv
```

```bash
pnpm add dotenv
```

```bash .env
SUPABASE_URL=supabase_project_url
SUPABASE_PUBLISHABLE_KEY=supabase_publishable_key
```

## Create a client

You need setup code to configure a Supabase client to use cookies. Once you have the utility code, you can use the `createClient` utility functions to get a properly configured Supabase client.

Use the browser client in code that runs on the browser, and the server client in code that runs on the server.

### Write utility functions to create Supabase clients

To access Supabase from a Next.js app, you need 2 types of Supabase clients:

1. **Client Component client** - To access Supabase from Client Components, which run in the browser.
2. **Server Component client** - To access Supabase from Server Components, Server Actions, and Route Handlers, which run only on the server.

Since Next.js Server Components can't write cookies, you need a [Proxy](https://nextjs.org/docs/app/getting-started/proxy) to refresh expired Auth tokens and store them.

The Proxy is responsible for:

1. Refreshing the Auth token by calling `supabase.auth.getClaims()`.
2. Passing the refreshed Auth token to Server Components, so they don't attempt to refresh the same token themselves. This is accomplished with `request.cookies.set`.
3. Passing the refreshed Auth token to the browser, so it replaces the old token. This is accomplished with `response.cookies.set`.

What does the `cookies` object do?</span>}
id="utility-cookies"
>

The cookies object lets the Supabase client know how to access the cookies, so it can read and write the user session data. To make `@supabase/ssr` framework-agnostic, the cookies methods aren't hard-coded. These utility functions adapt `@supabase/ssr`'s cookie handling for Next.js.

`setAll` is called whenever the library needs to write cookies, for example after a token refresh. It receives two arguments: the array of cookies to set, and a `headers` object containing cache headers (`Cache-Control`, `Expires`, `Pragma`) that must be applied to the HTTP response to prevent CDNs from caching the response and leaking the session to other users. In the Proxy, apply these headers to the response. In Server Components, the headers cannot be set, which is why the `setAll` call is wrapped in a try/catch and the error is ignored. The Proxy handles writing cookies and headers on every request.

The cookie is named `sb-<project_ref>-auth-token` by default.

Do I need to create a new client for every route?</span>}
id="client-deduplication"
>

Yes! Creating a Supabase client is lightweight.

- On the server, it basically configures a `fetch` call. You need to reconfigure the fetch call anew for every request to your server, because you need the cookies from the request.
- On the client, `createBrowserClient` already uses a singleton pattern, so you only ever create one instance, no matter how many times you call your `createClient` function.

Create a `lib/supabase` folder at the root of your project, or inside the `./src` folder if you are using one, with a file for each type of client. Then copy the lib utility functions for each client type.

### Hook up proxy

The code adds a [matcher](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#matcher) so the Proxy doesn't run on routes that don't access Supabase.

Be careful when protecting pages. The server gets the user session from the cookies, which can be spoofed by anyone.

Always use `supabase.auth.getClaims()` to protect pages and user data.

_Never_ trust `supabase.auth.getSession()` inside server code such as Proxy. It isn't guaranteed to revalidate the Auth token.

It's safe to trust `getClaims()` because it validates the JWT signature against the project's published public keys every time.

## Congratulations

You're done! To recap, you've successfully:

- Called Supabase from a Server Action.
- Called Supabase from a Server Component.
- Set up a Supabase client utility to call Supabase from a Client Component. You can use this if you need to call Supabase from a Client Component, for example to set up a realtime subscription.
- Set up Proxy to automatically refresh the Supabase Auth session.

You can now use any Supabase features from your client or server code!

### Set up server-side hooks

Set up server-side hooks in `src/hooks.server.ts`. The hooks:

- Create a request-specific Supabase client, using the user credentials from the request cookie. This client is used for server-only code.
- Check user authentication.
- Guard protected pages.

To prevent TypeScript errors, add type definitions for the new event.locals properties.

### Create a Supabase client in your root layout

Create a Supabase client in your root `+layout.ts`. This client can be used to access Supabase from the client or the server. In order to get access to the Auth token on the server, use a `+layout.server.ts` file to pass in the session from event.locals.

Page components can access the Supabase client from the `data` object using the `load` function.

## Congratulations

You're done! To recap, you've successfully:

- Set up server-side hooks to create a request-specific Supabase client and guard protected pages.
- Created a Supabase client in your root layout to use on both the client and server.

You can now use any Supabase features from your client or server code!

By default, Astro apps are static. This means the requests for data happen at build time, rather than when the user requests a page. At build time, there is no user, session or cookies. Therefore, we need to configure Astro for Server-side Rendering (SSR) if you want data to be fetched dynamically per request.

```js astro.config.mjs
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'server',
})
```

```ts index.astro
---
import { createServerClient, parseCookieHeader } from "@supabase/ssr";

const supabase = createServerClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    cookies: {
      getAll() {
        return parseCookieHeader(Astro.request.headers.get('Cookie') ?? '')
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          Astro.cookies.set(name, value))
        Object.entries(headers).forEach(([key, value]) =>
          Astro.response.headers.set(key, value)
        )
      },
    },
  }
);
---
```

```html index.astro
<script>
  import { createBrowserClient } from "@supabase/ssr";

  const supabase = createBrowserClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
</script>
```

```ts route.ts
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const supabase = createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(context.request.headers.get('Cookie') ?? '')
        },
        setAll(cookiesToSet, _headers) {
          cookiesToSet.forEach(({ name, value }) =>
            context.cookies.set(name, value))
        },
      },
    }
  );

  return ...
}
```

```ts middleware.ts
import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(context.request.headers.get('Cookie') ?? '')
        },
        setAll(cookiesToSet, _headers) {
          cookiesToSet.forEach(({ name, value }) => context.cookies.set(name, value))
        },
      },
    }
  )

  return next()
})
```

## Congratulations

You can now use any Supabase features from your client or server code!

```ts _index.tsx
import { type LoaderFunctionArgs } from '@remix-run/node'
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

export async function loader({ request }: LoaderFunctionArgs) {
  const responseHeaders = new Headers()

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '')
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value, options }) =>
            responseHeaders.append('Set-Cookie', serializeCookieHeader(name, value, options))
          )
          Object.entries(cacheHeaders).forEach(([key, value]) => responseHeaders.set(key, value))
        },
      },
    }
  )

  return new Response('...', {
    headers: responseHeaders,
  })
}
```

```ts _index.tsx
import { type ActionFunctionArgs } from '@remix-run/node'
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

export async function action({ request }: ActionFunctionArgs) {
  const responseHeaders = new Headers()

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '')
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value, options }) =>
            responseHeaders.append('Set-Cookie', serializeCookieHeader(name, value, options))
          )
          Object.entries(cacheHeaders).forEach(([key, value]) => responseHeaders.set(key, value))
        },
      },
    }
  )

  return new Response('...', {
    headers: responseHeaders,
  })
}
```

```ts _index.tsx
import { type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { createBrowserClient } from "@supabase/ssr";

export async function loader({}: LoaderFunctionArgs) {
  return {
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY!,
    },
  };
}

export default function Index() {
  const { env } = useLoaderData<typeof loader>();

  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);

  return ...
}
```

## Congratulations

You can now use any Supabase features from your client or server code!

```ts _index.tsx
import { LoaderFunctionArgs } from 'react-router'
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

export async function loader({ request }: LoaderFunctionArgs) {
  const responseHeaders = new Headers()

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '')
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) =>
          responseHeaders.append('Set-Cookie', serializeCookieHeader(name, value))
        )
        Object.entries(cacheHeaders).forEach(([key, value]) => responseHeaders.set(key, value))
      },
    },
  })

  return new Response('...', {
    headers: responseHeaders,
  })
}
```

```ts _index.tsx
import { type ActionFunctionArgs } from '@react-router'
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

export async function action({ request }: ActionFunctionArgs) {
  const responseHeaders = new Headers()

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '')
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) =>
          responseHeaders.append('Set-Cookie', serializeCookieHeader(name, value))
        )
        Object.entries(cacheHeaders).forEach(([key, value]) => responseHeaders.set(key, value))
      },
    },
  })

  return new Response('...', {
    headers: responseHeaders,
  })
}
```

```ts _index.tsx
import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { createBrowserClient } from "@supabase/ssr";

export async function loader({}: LoaderFunctionArgs) {
  return {
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL!,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    },
  };
}

export default function Index() {
  const { env } = useLoaderData<typeof loader>();

  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  return ...
}
```

## Congratulations

You can now use any Supabase features from your client or server code!

```ts lib/supabase.js
const { createServerClient, parseCookieHeader, serializeCookieHeader } = require('@supabase/ssr')

exports.createClient = (context) => {
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.req.headers.cookie ?? '')
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          context.res.appendHeader('Set-Cookie', serializeCookieHeader(name, value))
        )
        Object.entries(headers).forEach(([key, value]) => context.res.setHeader(key, value))
      },
    },
  })
}
```

```ts app.js
const express = require("express")
const dotenv = require("dotenv")

const { createClient } = require("./lib/supabase")

const app = express()

app.post("/hello-world", async function (req, res, next) {
  const { email, emailConfirm } = req.body
  ...

  const supabase = createClient({ req, res })
})
```

## Congratulations

You can now use any Supabase features from your client or server code!

Create a Hono middleware that creates a Supabase client.

You can now use this middleware in your Hono application to create a server Supabase client that can be used to make authenticated requests.

## Caching considerations

If your app uses ISR (Incremental Static Regeneration) or is deployed behind a CDN, caching of HTTP responses can cause users to receive another user's session. When a session is refreshed, the new token is written to the response via `Set-Cookie`. If that response is cached and served to a different user, that user will be signed in as the wrong person.
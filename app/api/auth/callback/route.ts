import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
    // Use NextRequest's built-in nextUrl parser instead of instantiating a new URL
    const { searchParams, origin } = request.nextUrl

    const code = searchParams.get('code')
    const token_hash = searchParams.get('token_hash')
    // Use proper Supabase typing instead of 'as any'
    const type = searchParams.get('type') as EmailOtpType | null

    // SECURE: Prevent Open Redirect Vulnerabilities
    // Ensure the 'next' redirect is a relative path so attackers can't hijack your callback
    let next = searchParams.get('next') ?? '/gardens'
    if (!next.startsWith('/')) {
        next = '/gardens'
    }

    console.log(`[auth-callback] Received: code=${!!code}, token_hash=${!!token_hash}, type=${type}, next=${next}`)

    // Initialize the client once outside the conditionals
    const supabase = await createClient()

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            console.log(`[auth-callback] Exchanged code for session. Redirecting to ${next}`)
            return NextResponse.redirect(`${origin}${next}`)
        }
        console.error('[auth-callback] Code exchange error:', error.message)

    } else if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash })

        if (!error) {
            console.log(`[auth-callback] Verified OTP. Redirecting to ${next}`)
            return NextResponse.redirect(`${origin}${next}`)
        }
        console.error('[auth-callback] OTP verification error:', error.message)
    }

    // Fallback: Clone the original URL to build a clean error redirect
    const errorUrl = request.nextUrl.clone()
    errorUrl.pathname = '/auth/login'
    errorUrl.searchParams.set('error', 'CouldNotVerifyLink')

    // Clean up sensitive/auth parameters from the URL before redirecting
    errorUrl.searchParams.delete('code')
    errorUrl.searchParams.delete('token_hash')
    errorUrl.searchParams.delete('type')
    errorUrl.searchParams.delete('next')

    console.warn(`[auth-callback] All verification methods failed. Redirecting to login.`)
    return NextResponse.redirect(errorUrl)
}
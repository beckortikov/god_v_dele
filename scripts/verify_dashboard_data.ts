
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Manual .env parsing
const envPath = path.resolve(process.cwd(), '.env.local')
let env: Record<string, string> = {}
try {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
            env[match[1]] = match[2].trim()
        }
    })
} catch (e) {
    console.error('Error reading .env.local', e)
    process.exit(1)
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function verify() {
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1

    console.log(`Checking data for Year: ${currentYear}, Month: ${currentMonth}`)

    // 1. Fetch Payments
    const { data: payments, error } = await supabase
        .from('monthly_payments')
        .select('*')
        .eq('year', currentYear)

    if (error) {
        console.error('Error fetching payments:', error)
        return
    }

    console.log(`Found ${payments.length} payments for ${currentYear}`)

    const currentMonthPayments = payments.filter((p: any) => p.month_number === currentMonth)
    console.log(`Found ${currentMonthPayments.length} payments for Month ${currentMonth}`)

    const revenue = currentMonthPayments.reduce((sum: number, p: any) => sum + (Number(p.fact_amount) || 0), 0)
    console.log(`Calculated Monthly Revenue: ${revenue}`)

    if (currentMonthPayments.length > 0) {
        console.log('Sample Payment:', currentMonthPayments[0])
    } else {
        console.log('No payments for current month. Checking all payments:')
        payments.forEach((p: any) => console.log(`- Month ${p.month_number}, Year ${p.year}, Fact: ${p.fact_amount}`))
    }
}

verify()

const supabaseUrl = 'https://htlyvnqqbygiexmglphw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bHl2bnFxYnlnaWV4bWdscGh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NDAwMTUsImV4cCI6MjA5ODExNjAxNX0.GMHHq407TJ3Xt4V-L-SjpOywtflmIE6YwQsPpxBfcQs';

async function checkUsage() {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url = `${supabaseUrl}/rest/v1/posts?created_at=gte.${yesterday}`;

    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Prefer': 'count=exact'
      }
    });

    const range = res.headers.get('content-range');
    const count = range ? parseInt(range.split('/')[1]) : 0;
    
    console.log(`[Usage Tracker] Posts in the last 24 hours: ${count}`);
    
    const limit = 1500; // Gemini Free tier limit
    const threshold = 1200; // Warning threshold
    
    if (count >= threshold) {
      console.warn(`WARNING: Your daily link submissions (${count}) are close to the Gemini Free Tier limit of ${limit}. Recommend upgrading to pay-as-you-go.`);
    }
  } catch (error) {
    console.error('Failed to check database post usage count:', error);
  }
}

checkUsage();

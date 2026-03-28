import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch the article' }, { status: response.status });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Basic extraction strategy
    const headline = $('h1').first().text().trim() || $('title').text().trim();
    
    // Attempt to extract main body text
    // Remove scripts, styles, navs, headers, footers
    $('script, style, nav, header, footer, aside, iframe, noscript').remove();

    // A common selector for article bodies
    let body = $('article').text().trim();
    
    if (!body) {
      // Fallback to paragraphs if no article tag
      const paragraphs: string[] = [];
      $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 50) { // Filter out short UI snippets
          paragraphs.push(text);
        }
      });
      body = paragraphs.join('\n\n');
    }

    // Clean up excessive whitespace
    body = body.replace(/\s{2,}/g, ' ').trim();

    return NextResponse.json({ headline, body });
  } catch (error: any) {
    console.error('Scraping error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during scraping' }, { status: 500 });
  }
}

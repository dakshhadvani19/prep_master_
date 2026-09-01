import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
    console.log("Starting scraper...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // We will target Engineering first, then generalize.
    console.log("Navigating to MU Engineering page...");
    // Finding the exact URL for B.Tech CSE or Engineering from search
    // Using a known URL structure for MU
    await page.goto("https://www.marwadiuniversity.ac.in/b-tech-engineering/", { waitUntil: 'load', timeout: 60000 });

    const titles = await page.$$eval("h3, h4", els => els.map(e => e.innerText));
    console.log("Titles found:", titles.slice(0, 10));

    // Wait for the curriculum tab or section
    // They often use accordion or tabs.
    const hasCurriculum = await page.evaluate(() => document.body.innerText.includes('Curriculum') || document.body.innerText.includes('Syllabus'));
    console.log('Has Curriculum Section:', hasCurriculum);

    await browser.close();
}
run().catch(console.error);
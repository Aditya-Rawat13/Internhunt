const puppeteer = require('puppeteer');
const Internship = require('../models/Internship');

async function scrapeInternships() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.goto('https://internshala.com/internships/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Wait for the internship listings to load
        await page.waitForSelector('#internship_list_container_1');

        const internships = await page.evaluate(() => {
            const container = document.querySelector('#internship_list_container_1');
            if (!container) return [];
            const items = container.querySelectorAll('[id^="individual_internship_"]');
            return Array.from(items).map(item => {
                // Title and link
                const titleAnchor = item.querySelector('h3.job-internship-name a.job-title-href');
                const title = titleAnchor ? titleAnchor.textContent.trim() : '';
                const link = titleAnchor ? 'https://internshala.com' + titleAnchor.getAttribute('href') : '';
                // Company
                const companyElement = item.querySelector('p.company-name');
                const company = companyElement ? companyElement.textContent.trim() : '';
                // Location
                const locationElement = item.querySelector('.row-1-item.locations span a');
                const location = locationElement ? locationElement.textContent.trim() : '';
                // Duration
                const calendarIcon = item.querySelector('.ic-16-calendar');
                let duration = '';
                if (calendarIcon) {
                    const durationSpan = calendarIcon.parentElement.querySelector('span');
                    duration = durationSpan ? durationSpan.textContent.trim() : '';
                }
                // Stipend
                const stipendElement = item.querySelector('span.stipend');
                const stipend = stipendElement ? stipendElement.textContent.trim() : '';
                return {
                    title,
                    company,
                    location,
                    duration,
                    stipend,
                    link
                };
            });
        });

        // Harmonize Internshala fields
        for (const internship of internships) {
            if (internship.link) {
                const detailPage = await browser.newPage();
                try {
                    await detailPage.goto(internship.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await detailPage.waitForSelector('.internship_meta', { timeout: 10000 });
                    const applyByRaw = await detailPage.evaluate(() => {
                        const meta = document.querySelector('.internship_meta');
                        if (!meta) return '';
                        const applyByDiv = meta.querySelector('.apply_by .item_body');
                        return applyByDiv ? applyByDiv.textContent.trim() : '';
                    });
                    // Set Internshala logo
                    internship.logoUrl = 'https://internshttps://upload.wikimedia.org/wikipedia/en/8/8b/Internshala_company_logo.png?20180309195846hala.com/favicon.ico';
                    // Convert to ISO date string if possible
                    function parseToISO(dateStr) {
                        if (!dateStr) return '';
                        let d = null;
                        let match = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
                        if (match) {
                            const [_, day, month, year] = match;
                            d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
                        } else {
                            match = dateStr.match(/(\d{1,2}) ([A-Za-z]{3})' (\d{2})/);
                            if (match) {
                                const [_, day, monthStr, year] = match;
                                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                const month = (months.indexOf(monthStr) + 1).toString().padStart(2, '0');
                                const fullYear = parseInt(year, 10) < 50 ? '20' + year : '19' + year;
                                d = new Date(`${fullYear}-${month}-${day.padStart(2, '0')}`);
                            }
                        }
                        if (d && !isNaN(d.getTime())) {
                            return d.toISOString().slice(0, 10);
                        }
                        return dateStr;
                    }
                    internship.applyBy = parseToISO(applyByRaw);
                    internship.sourceSite = 'Internshala';
                } catch (err) {
                    internship.applyBy = '';
                    internship.sourceSite = 'Internshala';
                    internship.logoUrl = 'https://internshala.com/favicon.ico';
                } finally {
                    await detailPage.close();
                }
            } else {
                internship.applyBy = '';
                internship.sourceSite = 'Internshala';
                internship.logoUrl = 'https://internshala.com/favicon.ico';
            }
            await Internship.findOneAndUpdate(
                { link: internship.link },
                internship,
                { upsert: true, new: true }
            );
        }

        // MAKE INTERN SCRAPE
        const makePage = await browser.newPage();
        await makePage.goto('https://www.makeintern.com/internships/office-internship', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        await makePage.waitForSelector('div#internship-content');
        // Get all internship detail page links from each card's Apply button
        const makeInternLinks = await makePage.evaluate(() => {
            const cards = document.querySelectorAll('div#internship-content');
            return Array.from(cards).map(card => {
                const applyBtn = card.querySelector('div.view a.pull-right.btn.btn-default.btn-setting[href^="http"]');
                return applyBtn ? applyBtn.getAttribute('href') : null;
            }).filter(Boolean);
        });
        for (const link of makeInternLinks) {
            const detailPage = await browser.newPage();
            try {
                await detailPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await detailPage.waitForSelector('#internship-content', { timeout: 10000 });
                const data = await detailPage.evaluate(() => {
                    const root = document.querySelector('#internship-content');
                    if (!root) return null;
                    // Title from h1.intern_headings
                    const title = root.querySelector('h1.intern_headings')?.textContent.trim() || '';
                    // Company, Location, Stipend, ApplyBy, Duration
                    const lis = root.querySelectorAll('div.detail_inner ul.students-rank li');
                    let company = '', location = '', stipend = '', applyBy = '', duration = '';
                    lis.forEach(li => {
                        const label = li.querySelector('.pull-left.lefty-part');
                        const value = li.querySelector('.pull-right.righty-part');
                        if (label && value) {
                            const labelText = label.textContent.trim().toLowerCase();
                            if (labelText === 'by :') {
                                company = value.textContent.trim();
                            } else if (labelText === 'location(s):') {
                                location = value.textContent.trim();
                            } else if (labelText === 'stipend :') {
                                stipend = value.textContent.trim();
                            } else if (labelText.includes('last apply date')) {
                                applyBy = value.textContent.trim();
                            } else if (labelText === 'duration:') {
                                duration = value.textContent.trim();
                            }
                        }
                    });
                    // Extract logoUrl from .logo_details img
                    const logoUrl = root.querySelector('.logo_details img')?.getAttribute('src') || '';
                    return {
                        title,
                        company,
                        location,
                        stipend,
                        applyBy,
                        duration,
                        link: window.location.href,
                        sourceSite: 'MakeIntern',
                        logoUrl,
                    };
                });
                // Normalize applyBy to ISO yyyy-mm-dd
                function parseToISO(dateStr) {
                    if (!dateStr) return '';
                    dateStr = dateStr.replace(/\s+/g, '');
                    let d = null;
                    let match = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
                    if (match) {
                        const [_, day, month, year] = match;
                        d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
                    } else {
                        match = dateStr.match(/(\d{1,2})([A-Za-z]{3})'(\d{2})/);
                        if (match) {
                            const [_, day, monthStr, year] = match;
                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            const month = (months.indexOf(monthStr) + 1).toString().padStart(2, '0');
                            const fullYear = parseInt(year, 10) < 50 ? '20' + year : '19' + year;
                            d = new Date(`${fullYear}-${month}-${day.padStart(2, '0')}`);
                        }
                    }
                    if (d && !isNaN(d.getTime())) {
                        return d.toISOString().slice(0, 10);
                    }
                    return dateStr;
                }
                if (data) {
                    data.applyBy = parseToISO(data.applyBy);
                    await Internship.findOneAndUpdate(
                        { link: data.link },
                        data,
                        { upsert: true, new: true }
                    );
                }
            } catch (err) {
                // skip
            } finally {
                await detailPage.close();
            }
        }

        return internships;
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

module.exports = { scrapeInternships }; 
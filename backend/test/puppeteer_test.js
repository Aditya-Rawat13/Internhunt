const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let allInternships = [];

    try {
        // INTERN SHALA SCRAPE
        const page = await browser.newPage();
        await page.goto('https://internshala.com/internships/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        await page.waitForSelector('#internship_list_container_1');
        const internships = await page.evaluate(() => {
            const container = document.querySelector('#internship_list_container_1');
            if (!container) return [];
            const items = container.querySelectorAll('[id^="individual_internship_"]');
            return Array.from(items).map(item => {
                const titleAnchor = item.querySelector('h3.job-internship-name a.job-title-href');
                const title = titleAnchor ? titleAnchor.textContent.trim() : '';
                const link = titleAnchor ? 'https://internshala.com' + titleAnchor.getAttribute('href') : '';
                const companyElement = item.querySelector('p.company-name');
                const company = companyElement ? companyElement.textContent.trim() : '';
                const locationElement = item.querySelector('.row-1-item.locations span a');
                const location = locationElement ? locationElement.textContent.trim() : '';
                const calendarIcon = item.querySelector('.ic-16-calendar');
                let duration = '';
                if (calendarIcon) {
                    const durationSpan = calendarIcon.parentElement.querySelector('span');
                    duration = durationSpan ? durationSpan.textContent.trim() : '';
                }
                const stipendElement = item.querySelector('span.stipend');
                const stipend = stipendElement ? stipendElement.textContent.trim() : '';
                return {
                    title,
                    company,
                    location,
                    duration,
                    stipend,
                    link,
                    sourceSite: 'Internshala'
                };
            });
        });
        // For each internship, open the detail page and get the apply_by date
        for (let i = 0; i < internships.length; i++) {
            const internship = internships[i];
            if (internship.link) {
                const detailPage = await browser.newPage();
                try {
                    await detailPage.goto(internship.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await detailPage.waitForSelector('.internship_meta', { timeout: 10000 });
                    const applyBy = await detailPage.evaluate(() => {
                        const meta = document.querySelector('.internship_meta');
                        if (!meta) return '';
                        const applyByDiv = meta.querySelector('.apply_by .item_body');
                        return applyByDiv ? applyByDiv.textContent.trim() : '';
                    });
                    internship.apply_by = applyBy;
                } catch (err) {
                    internship.apply_by = '';
                } finally {
                    await detailPage.close();
                }
            } else {
                internship.apply_by = '';
            }
        }
        allInternships = allInternships.concat(internships);

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
                            } else if (labelText === 'last apply date :') {
                                applyBy = value.textContent.trim();
                            } else if (labelText === 'duration:') {
                                duration = value.textContent.trim();
                            }
                        }
                    });
                    return {
                        title,
                        company,
                        location,
                        stipend,
                        applyBy,
                        duration,
                        link: window.location.href,
                        sourceSite: 'MakeIntern',
                    };
                });
                if (data) allInternships.push(data);
            } catch (err) {
                // skip
            } finally {
                await detailPage.close();
            }
        }

        // Save to CSV
        const csv = parse(allInternships);
        const filePath = path.join(__dirname, 'internships_test.csv');
        fs.writeFileSync(filePath, csv);
        console.log(`Scraped data saved to ${filePath}`);
    } catch (error) {
        console.error('Scraping error:', error);
    } finally {
        await browser.close();
    }
})(); 
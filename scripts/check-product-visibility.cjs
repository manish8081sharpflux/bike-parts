const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const { loadEnvConfig } = require(require.resolve('@next/env', { paths: [require.resolve('next')] }));
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
loadEnvConfig(process.cwd());
const db = new PrismaClient();
const name = 'QA Visibility Battery ' + Date.now();
const base = 'http://localhost:3000';
async function main() {
  const browser = await chromium.launch({ headless: true });
  const admin = await browser.newPage();
  admin.setDefaultTimeout(20000);
  try {
    await admin.goto(base + '/admin/products/new');
    if (admin.url().includes('/login')) {
      await admin.locator('[name=email]').fill(process.env.ADMIN_EMAIL);
      await admin.locator('[name=password]').fill(process.env.ADMIN_PASSWORD);
      await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
      await admin.waitForURL('**/admin/products/new');
    }
    console.log('PASS: Admin login and add form loaded.');
    for (const [key, value] of Object.entries({ name, productType: 'Battery', description: 'Temporary storefront visibility verification.', price: '1234', stock: '5', gstRate: '18', oemPartNumber: 'QA-OEM-12V', sku: name.replaceAll(' ', '-'), imageUrl: '/assets/home/part-battery.png', searchTags: 'qa-visibility-battery' })) {
      await admin.locator('form [name="' + key + '"]').fill(value);
    }
    await admin.locator('[name=brand]').selectOption('Honda');
    await admin.locator('[name=category]').selectOption('Electrical');
    await admin.getByRole('button', { name: '+ Add Specification', exact: true }).click();
    await admin.getByLabel('Field Name 1', { exact: true }).fill('Voltage');
    await admin.getByLabel('Value 1', { exact: true }).fill('12V');
    await admin.getByRole('button', { name: '+ Add Feature', exact: true }).click();
    await admin.getByLabel('Feature 1', { exact: true }).fill('Waterproof');
    await admin.getByRole('button', { name: '+ Add Item', exact: true }).click();
    await admin.getByLabel('Item 1', { exact: true }).fill('1 x Battery');
    await admin.getByRole('button', { name: '+ Add Vehicle', exact: true }).click();
    for (const [label, value] of Object.entries({Brand:'Honda', Model:'Shine 125', Variant:'Drum Brake', 'Year Range':'2020-2024'})) {
      await admin.getByLabel(label + ' 1', {exact:true}).fill(value);
    }
    await admin.getByRole('button', {name:'Create product',exact:true}).click();
    await admin.waitForURL(base + '/admin/products');
    const listing = await db.bikePartListing.findFirstOrThrow({where:{name}});
    console.log('PASS: Product created through admin form:', listing.id);
    const customer = await browser.newPage({viewport:{width:1440,height:1000}});
    await customer.goto(base, {waitUntil:'networkidle'});
    fs.mkdirSync('artifacts', {recursive:true});
    await customer.screenshot({path:'artifacts/product-visibility.png',fullPage:true});
    console.log('Customer visible matching elements:', await customer.getByText(name,{exact:true}).count());
    fs.writeFileSync('artifacts/product-visibility-text.txt', await customer.locator('body').innerText());
    const card = customer.getByText(name,{exact:true}).first();
    await card.waitFor({state:'visible',timeout:15000});
    console.log('PASS: Product visible on customer homepage without admin login.');
    await card.click();
    await customer.getByRole('button',{name:'Specifications',exact:true}).click();
    await customer.getByText('12V',{exact:true}).waitFor({state:'visible'});
    console.log('PASS: Customer product details show Voltage 12V.');
    await customer.screenshot({path:'artifacts/product-specifications.png',fullPage:true});
  } finally {
    const listing = await db.bikePartListing.findFirst({where:{name}});
    if (listing) {
      await admin.goto(base + '/admin/products');
      const row = admin.getByRole('row').filter({hasText:name});
      await row.getByRole('button',{name:'Delete',exact:true}).click();
      await admin.waitForTimeout(1500);
      if (await db.bikePartListing.findUnique({where:{id:listing.id}})) throw new Error('Test product cleanup failed');
      console.log('PASS: Temporary product removed through admin.');
    }
    await browser.close();
    await db.$disconnect();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

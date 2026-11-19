import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prepareZXingModule as prepareWriter, writeBarcode } from "zxing-wasm/writer";
import { emptyData } from "../../src/lib/types";

// Isolated UI contract check. Live PostgreSQL transactions are covered by test:live.
const cases = [
 {format:"CODE128",code:"0001234567890",angle:0,invert:false},
 {format:"EAN13",code:"5901234123457",angle:0,invert:false},
 {format:"EAN8",code:"96385074",angle:90,invert:false},
 {format:"UPC",code:"036000291452",angle:0,invert:true},
 {format:"CODE39",code:"BAG-123",angle:180,invert:false},
 {format:"ITF",code:"12345670",angle:0,invert:false},
 {format:"QRCode",code:"NAJD-QR-001",angle:0,invert:false},
 {format:"DataMatrix",code:"NAJD-DM-001",angle:0,invert:false},
 {format:"",code:"",angle:0,invert:false},
];
for (const sample of cases) test(`shared stock: product photo and ${sample.format ? "barcode scan " + sample.format : "sale by name without barcode"}`, async ({ page }) => {
  const business = "10000000-0000-4000-8000-000000000001";
  const branch = "10000000-0000-4000-8000-000000000002";
  const other = "10000000-0000-4000-8000-000000000003";
  const pool = "10000000-0000-4000-8000-000000000008";
  const user = "10000000-0000-4000-8000-000000000004";
  const product = "10000000-0000-4000-8000-000000000005";
  const variant = "10000000-0000-4000-8000-000000000006";
  const sale = "10000000-0000-4000-8000-000000000007";
  const withBarcode = Boolean(sample.format);
  const barcode = sample.code;
  const data = structuredClone(emptyData);
  Object.assign(data, {
    user_id: user, email_verified: true, inventory_branch_id: pool,
    businesses: [{ id: business, tax_bps: 0 }],
    branches: [{ id: branch, business_id: business, name: "فرع الستي سنتر" }, { id: other, business_id: business, name: "فرع شارع أبو بكر" }, {id:pool,business_id:business,name:"المخزون الإجمالي"}],
    memberships: [{ id: user, user_id: user, business_id: business, branch_id: null, role: "owner" }],
  });
  const commands: { action: string; payload: Record<string, unknown> }[] = [];
  await page.route("**/api/auth/**", route => route.fulfill({ json: {} }));
  const sold: Record<string,{sales:number;pieces:number;tickets:number}> = {};
  await page.route("**/api/data?*", route => {
    const selected=new URL(route.request().url()).searchParams.get("metrics_branch") || branch;
    return route.fulfill({json:{...data,daily_summary:{branch_id:selected,...(sold[selected] || {sales:0,pieces:0,tickets:0}),stock:data.branch_inventory.reduce((n,row)=>n+Number(row.quantity),0)}}});
  });
  await page.route("**/api/product?*", route => route.fulfill({ json: { cost: 1000, description: "" } }));
  await page.route("**/api/command", async route => {
    const command = route.request().postDataJSON();
    commands.push(command);
    if (command.action === "product") {
      data.products.push({ id: product, business_id: business, branch_id: branch, name: command.payload.name, image_url: command.payload.image_url, active: true });
      data.product_variants.push({ id: variant, business_id: business, branch_id: branch, product_id: product, name: "", sku: command.payload.sku, price: command.payload.price, min_stock: 5 });
      data.product_barcodes.push({ id: variant, business_id: business, branch_id: branch, variant_id: variant, barcode: command.payload.barcode || "AUTO-" + command.payload.sku });
      data.branch_inventory.push({ id: branch, business_id: business, branch_id: pool, variant_id: variant, quantity: 35 }, { id: other, business_id: business, branch_id: other, variant_id: variant, quantity: 0 });
      await route.fulfill({ json: { id: product } });
    } else if (command.action === "checkout") {
      data.branch_inventory[0].quantity = 33;
      sold[command.payload.branch_id]={sales:5000,pieces:2,tickets:1};
      await route.fulfill({ json: { id: sale, total: 5000, tax: 0, items: [{ variant_id: variant, name: "منتج اختبار", price: 2500, qty: 2, discount: 0 }] } });
    } else await route.fulfill({ status: 400, json: { error: "Unexpected command", rolledBack: true } });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices,"getUserMedia",{value: async () => {
      const canvas = document.createElement("canvas"); canvas.width=1000; canvas.height=600;
      const context=canvas.getContext("2d")!;context.fillStyle="white";context.fillRect(0,0,1000,600);
      (window as unknown as {cameraTestCanvas:HTMLCanvasElement}).cameraTestCanvas=canvas;
      return canvas.captureStream(15);
    }});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).first().click();
  await page.getByRole("button",{name:"الدخول برمز يصل إلى البريد",exact:true}).click();
  await page.getByLabel("البريد الإلكتروني").fill("ui-test@example.invalid");
  await page.getByRole("button", { name: "إرسال رمز إلى البريد" }).click();
  await page.getByLabel("رمز الدخول").fill("123456");
  await page.getByRole("button", { name: "تأكيد الرمز والدخول" }).click();
  await page.getByRole("button", {name:"فرع شارع أبو بكر",exact:true}).click();
  await expect(page.getByRole("button",{name:"فرع شارع أبو بكر",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button", { name: /المنتجات والكميات/ }).click();
  await page.getByRole("button", { name: "إضافة منتج", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("اسم المنتج").fill("منتج اختبار");
  const code = dialog.getByRole("textbox", { name: "باركود المنتج الجديد" });
  if (sample.format === "CODE128") {
    await page.addScriptTag({path:"node_modules/jsbarcode/dist/JsBarcode.all.min.js"});
    await dialog.getByRole("button",{name:"مسح باركود المنتج",exact:true}).click();
    const registrationScanner=dialog.getByRole("region",{name:"مسح باركود المنتج الجديد"});
    const image=await page.evaluate(text=>{
      const canvas=document.createElement("canvas");
      (window as unknown as {JsBarcode:(canvas:HTMLCanvasElement,text:string,options:object)=>void}).JsBarcode(canvas,text,{format:"CODE128",width:3,height:100,margin:24});
      return canvas.toDataURL("image/png").split(",")[1];
    },barcode);
    await registrationScanner.getByLabel("قراءة باركود من صورة").setInputFiles({name:"new-product-code.png",mimeType:"image/png",buffer:Buffer.from(image,"base64")});
    await expect(code).toHaveValue(barcode);
    await expect(registrationScanner).toHaveCount(0);
    expect(commands).toHaveLength(0);
  } else await code.fill(withBarcode ? barcode : "");
  await code.press("Enter");
  expect(commands).toHaveLength(0);
  await expect(dialog.getByLabel("سعر البيع ₪")).toBeFocused();
  await dialog.getByLabel("سعر البيع ₪").fill("25");
  await dialog.getByRole("spinbutton", { name: "الكمية الإجمالية", exact: true }).fill("35");
  const png = await page.evaluate(() => { const c=document.createElement('canvas'); c.width=32; c.height=32; const ctx=c.getContext('2d')!; ctx.fillStyle='red';ctx.fillRect(0,0,32,32);return c.toDataURL('image/png').split(',')[1]; });
  await dialog.getByLabel("صورة الشنطة (اختياري)").setInputFiles({name:"bag.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
  await expect(dialog.getByRole("img",{name:"صورة المنتج"})).toBeVisible();
  await dialog.getByRole("button", { name: "حفظ المنتج والكميات" }).click();
  await expect(page.locator(".daily-product-title strong")).toHaveText("منتج اختبار");
  expect(commands[0].payload.barcode).toBe(withBarcode ? barcode : "");
  expect(commands[0].payload.image_url).toMatch(/^data:image/);
  expect(commands[0].payload.initial_stock).toEqual([{branch_id:other,quantity:35}]);
  await page.getByRole("button", { name: /^البيع/ }).click();
  if (withBarcode) {
    await page.addScriptTag({path:"node_modules/jsbarcode/dist/JsBarcode.all.min.js"});
    const barcodeImage = async (text: string, format = "CODE128") => {
      if (format === "QRCode" || format === "DataMatrix") {
        await prepareWriter({overrides:{wasmBinary:new Uint8Array(readFileSync("node_modules/zxing-wasm/dist/writer/zxing_writer.wasm")).buffer},fireImmediately:true});
        const result = await writeBarcode(text,{format,scale:8,addQuietZones:true});
        if (!result.image) throw Error(result.error);
        return Buffer.from(await result.image.arrayBuffer());
      }
      return Buffer.from(await page.evaluate(({text,format}) => {
        const canvas=document.createElement("canvas");
        (window as unknown as {JsBarcode:(canvas:HTMLCanvasElement,text:string,options:object)=>void}).JsBarcode(canvas,text,{format,width:3,height:100,margin:24,displayValue:true});
        return canvas.toDataURL("image/png").split(",")[1];
      },{text,format}),"base64");
    };
    const camera = page.getByRole("region",{name:"قراءة الباركود التلقائية"});
    await expect(camera).toBeVisible();
    await expect.poll(() => page.workers().length).toBeGreaterThan(0);
    await page.workers().at(-1)!.evaluate(() => {
      const scope=self as unknown as {postMessage:(value:Record<string,unknown>)=>void;testDecodeTimes:number[]};
      const send=scope.postMessage.bind(scope);scope.testDecodeTimes=[];
      scope.postMessage=value=>{if(typeof value.elapsed === "number")scope.testDecodeTimes.push(value.elapsed);send(value);};
    });
    await camera.getByLabel("قراءة باركود من صورة").setInputFiles({name:"unknown.png",mimeType:"image/png",buffer:await barcodeImage("UNKNOWN-128")});
    await expect(camera.getByText("UNKNOWN-128",{exact:true})).toBeVisible();
    await expect(camera.getByText(/الرقم مقروء، لكنه غير مسجّل/)).toBeVisible();
    const present = async (text: string) => {
      const png = text ? (await barcodeImage(text,sample.format)).toString("base64") : "";
      await page.evaluate(async ({png,angle,invert}) => {
        const canvas=(window as unknown as {cameraTestCanvas:HTMLCanvasElement}).cameraTestCanvas;
        const image=png ? new Image() : null;
        if (image) {image.src="data:image/png;base64,"+png;await image.decode();}
        const context=canvas.getContext("2d")!;context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);
        if (image) {
          context.save();context.translate(canvas.width/2,canvas.height/2);context.rotate(angle*Math.PI/180);if(invert)context.filter="invert(1)";context.drawImage(image,-image.width/2,-image.height/2);context.restore();
        }
      },{png,angle:sample.angle,invert:sample.invert});
    };
    const readStarted = Date.now();
    await present(barcode);
    const quantity=page.getByRole("spinbutton",{name:"كمية منتج اختبار",exact:true});
    await expect(quantity).toHaveValue("1");
    console.log(sample.format + " first video recognition: " + (Date.now()-readStarted) + "ms");
    await page.waitForTimeout(2200);
    await expect(quantity).toHaveValue("1");
    await present("");await page.waitForTimeout(1600);await present(barcode);
    await expect(quantity).toHaveValue("2");
    await expect(camera).toBeVisible();
    const times=await page.workers().at(-1)!.evaluate(() => (self as unknown as {testDecodeTimes:number[]}).testDecodeTimes);
    times.sort((a,b)=>a-b);console.log(sample.format+" median worker decode: "+times[Math.floor(times.length/2)].toFixed(1)+"ms");
    if(sample.format === "CODE128") {
      await quantity.fill("1");
      await page.getByRole("textbox",{name:"باركود المنتج",exact:true}).fill(barcode);
      await page.getByRole("textbox",{name:"باركود المنتج",exact:true}).press("Enter");
      await expect(quantity).toHaveValue("2");
      await expect(camera).toHaveCount(0);
      await expect(page.getByRole("button",{name:"تشغيل الكاميرا",exact:true})).toBeVisible();
    }
  } else {
    const tile = page.getByRole("button", { name:"إضافة منتج اختبار إلى الفاتورة",exact:true });
    await expect(tile.getByRole("img")).toBeVisible();
    await tile.click(); await tile.click();
  }
  await expect(page.getByRole("spinbutton", { name: "كمية منتج اختبار", exact: true })).toHaveValue("2");
  expect(commands.filter(c => c.action === "checkout")).toHaveLength(0);
  await page.getByRole("button", { name: /تأكيد البيع وخصم الكمية/ }).click();
  await expect(page.getByRole("heading", { name: "تم إصدار الإيصال" })).toBeVisible();
  const checkouts = commands.filter(c => c.action === "checkout");
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].payload).toMatchObject({ branch_id: other, cash: 5000, items: [{ variant_id: variant, qty: 2, discount: 0 }] });
  await page.getByRole("button", { name: "بيع جديد", exact: true }).click();
  await expect(page.getByRole("region",{name:"ملخص اليوم"})).toContainText("2 قطعة");
  await expect(page.getByRole("region",{name:"ملخص اليوم"})).toContainText("33 قطعة");
  await page.screenshot({path:".local/najd-branch-today.png",fullPage:true});
  await page.getByRole("button",{name:"فرع الستي سنتر",exact:true}).click();
  await expect(page.getByRole("region",{name:"ملخص اليوم"})).toContainText("0 قطعة");
  await page.getByRole("button", { name: /المنتجات والكميات/ }).click();
  const row = page.getByRole("row").filter({ hasText: "منتج اختبار" });
  await expect(row).toContainText("33");
  await expect(page.getByRole("columnheader",{name:"الكمية الإجمالية",exact:true})).toBeVisible();
  await page.screenshot({ path: `.local/najd-shared-${withBarcode}.png`, fullPage: true });
});

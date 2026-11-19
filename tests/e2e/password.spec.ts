import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {emptyData} from "../../src/lib/types";

for (const autoLoginFails of [false,true]) test(`password setup requires verified OTP; automatic login failure=${autoLoginFails}`,async({page})=>{
 const requests:{path:string;body:Record<string,string>}[]=[];
 const password="Fixture-only-"+randomUUID();
 await page.route("**/api/auth/**",async route=>{
   const path=new URL(route.request().url()).pathname;
   const body=route.request().method()==="POST" ? route.request().postDataJSON() : {};
   requests.push({path,body});
   if(path.endsWith("/email-otp/reset-password") && body.otp!=="123456") {
     await route.fulfill({status:400,json:{code:"INVALID_OTP",message:"Invalid OTP"}});return;
   }
   if(path.endsWith("/sign-in/email") && autoLoginFails) {await route.fulfill({status:400,json:{code:"INVALID_EMAIL_OR_PASSWORD",message:"Invalid email or password"}});return;}
   await route.fulfill({json:{success:true}});
 });
 await page.route("**/api/data?*",route=>route.fulfill({json:{...emptyData,user_id:"10000000-0000-4000-8000-000000000001",user_email:"password-test@example.invalid"}}));
 await page.goto("/");
 await page.getByRole("button",{name:"تسجيل الدخول",exact:true}).first().click();
 await expect(page.getByLabel("كلمة المرور",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"تعيين أو تغيير كلمة المرور",exact:true}).click();
 expect(requests.filter(request=>request.path.endsWith("/email-otp/reset-password"))).toHaveLength(0);
 await page.getByLabel("البريد الإلكتروني").fill("password-test@example.invalid");
 await page.getByRole("button",{name:"إرسال رمز تعيين كلمة المرور"}).click();
 expect(requests.find(request=>request.path.endsWith("/email-otp/send-verification-otp"))?.body).toEqual({email:"password-test@example.invalid",type:"forget-password"});
 await page.getByLabel("رمز الدخول").fill("000000");
 await page.getByLabel("كلمة المرور الجديدة",{exact:true}).fill(password);
 await page.getByLabel("تأكيد كلمة المرور",{exact:true}).fill(password+"mismatch");
 await page.getByRole("button",{name:"حفظ كلمة المرور والدخول"}).click();
 await expect(page.getByText("كلمتا المرور غير متطابقتين.",{exact:true})).toBeVisible();
 expect(requests.filter(request=>request.path.endsWith("/email-otp/reset-password"))).toHaveLength(0);
 await page.getByLabel("تأكيد كلمة المرور",{exact:true}).fill(password);
 await page.getByRole("button",{name:"حفظ كلمة المرور والدخول"}).click();
 await expect(page.getByText(/تعذر تعيين كلمة المرور/)).toBeVisible();
 expect(requests.filter(request=>request.path.endsWith("/sign-in/email"))).toHaveLength(0);
 await page.getByLabel("رمز الدخول").fill("123456");
 await page.getByRole("button",{name:"حفظ كلمة المرور والدخول"}).click();
 if(autoLoginFails) {
   await expect(page.getByText("تم حفظ كلمة المرور. سجّل الدخول باستخدامها الآن.",{exact:true})).toBeVisible();
   await expect(page.getByLabel("كلمة المرور",{exact:true})).toBeVisible();
 } else await expect(page.getByRole("dialog")).toHaveCount(0);
 expect(requests.filter(request=>request.path.endsWith("/sign-in/email"))).toHaveLength(1);
 expect(await page.evaluate(()=>Object.values(localStorage))).not.toContain(password);
});

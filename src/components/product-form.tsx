"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { productSchema } from "@/lib/domain";
import { Button } from "./ui/button";
const formSchema = productSchema.extend({
  price: z
    .number()
    .min(0)
    .max(1000000)
    .transform((v) => Math.round(v * 100)),
  cost: z
    .number()
    .min(0)
    .max(1000000)
    .transform((v) => Math.round(v * 100)),
  min_stock: z.number().int().min(0),
});
type Form = z.infer<typeof formSchema>;
export function ProductForm({
  onSave,
  initial,
}: {
  onSave: (p: Form) => Promise<void>;
  initial?: Partial<Form>;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof formSchema>, unknown, Form>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      min_stock: 5,
      category: "",
      image_url: "",
      description: "",
      ...initial,
      price: (initial?.price ?? 0) / 100,
      cost: (initial?.cost ?? 0) / 100,
    },
  });
  return (
    <form className="form-grid" onSubmit={handleSubmit(onSave)}>
      <label className="span2">
        اسم المنتج
        <input {...register("name")} />
        {errors.name && <small>أدخل اسمًا من حرفين على الأقل</small>}
      </label>
      <label>
        SKU
        <input dir="ltr" {...register("sku")} />
      </label>
      <label>
        التصنيف
        <input {...register("category")} />
      </label>
      <label className="span2">
        الباركود
        <div className="inline">
          <input dir="ltr" {...register("barcode")} />
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setValue(
                "barcode",
                "SB" + crypto.randomUUID().replaceAll("-", "").slice(0, 16),
              )
            }
          >
            توليد
          </Button>
        </div>
      </label>
      <label>
        سعر البيع (₪)
        <input
          type="number"
          step="0.01"
          min="0"
          {...register("price", {
            valueAsNumber: true,
          })}
        />
      </label>
      <label>
        تكلفة الشراء (₪)
        <input
          type="number"
          step="0.01"
          min="0"
          {...register("cost", {
            valueAsNumber: true,
          })}
        />
      </label>
      <label>
        حد المخزون المنخفض
        <input
          type="number"
          min="0"
          {...register("min_stock", { valueAsNumber: true })}
        />
      </label>
      <label>
        رابط الصورة HTTPS
        <input dir="ltr" {...register("image_url")} />
      </label>
      <label className="span2">
        الوصف
        <textarea {...register("description")} />
      </label>
      {Object.keys(errors).length > 0 && (
        <p className="error span2">
          راجع الحقول: {Object.keys(errors).join("، ")}
        </p>
      )}
      <Button className="span2" disabled={isSubmitting}>
        {isSubmitting ? "جارٍ الحفظ…" : "حفظ المنتج"}
      </Button>
    </form>
  );
}

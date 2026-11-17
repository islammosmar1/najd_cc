export const localDay = (value: string | Date) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Hebron" });
export function dayStart(day: string) {
  const noon = new Date(day + "T12:00:00Z");
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Hebron",
      timeZoneName: "longOffset",
    })
      .formatToParts(noon)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return new Date(day + "T00:00:00" + offset).toISOString();
}
export function nextDay(day: string) {
  return new Date(new Date(day + "T12:00:00Z").getTime() + 86400000)
    .toISOString()
    .slice(0, 10);
}

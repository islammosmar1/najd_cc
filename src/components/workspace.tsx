"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyData, type Dataset } from "@/lib/types";
import { dayStart, nextDay } from "@/lib/dates";
import { OperationError } from "@/lib/domain";
import { DailyDesk } from "./daily-desk";
const today = () => new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Hebron"});
export function Workspace({configured, signedIn}: {configured: boolean; signedIn: boolean}) {
  const [data, setData] = useState<Dataset>(emptyData);
  const [business, setBusiness] = useState("");
  const [branch, setBranch] = useState("");
  const [signed, setSigned] = useState(signedIn);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [sync, setSync] = useState("");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [allBranches, setAllBranches] = useState(false);
  const generation = useRef(0);
  const requestKeys = useRef(new Map<string, string>());
  const refresh = useCallback(async () => {
    if (!configured || !signed) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        business,
        from: dayStart(from),
        to: dayStart(nextDay(to)),
      });
      if (branch && !allBranches) q.set("branch", branch);
      const r = await fetch("/api/data?" + q, { cache: "no-store" });
      const json = await r.json();
      if (request !== generation.current) return;
      if (r.status === 401) {
        setSigned(false);
        setData(emptyData);
        setBusiness("");
        setBranch("");
        return;
      }
      if (!r.ok) throw Error(json.error);
      setData(json);
      setBusiness((old) => old || json.businesses[0]?.id || "");
      setBranch((old) => old || json.branches[0]?.id || "");
      setSync("");
    } catch (e) {
      if (request === generation.current) setSync((e as Error).message);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [configured, signed, business, branch, from, to, allBranches]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const on = () => {
      setOnline(true);
      void refresh();
    };
    const off = () => setOnline(false);
    const timer = setTimeout(() => setOnline(navigator.onLine), 0);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refresh]);
  useEffect(() => {
    if (!configured || !signed) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void refresh();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [configured, signed, refresh]);
  async function execute(action: string, payload: Record<string, unknown>) {
    if (!online) throw Error("الاتصال مقطوع؛ لم يتم تأكيد العملية");
    const signature = JSON.stringify({ action, business, branch, payload });
    const retryKey = requestKeys.current.get(signature) || crypto.randomUUID();
    requestKeys.current.set(signature, retryKey);
    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload:
          action === "checkout"
            ? payload
            : {
                ...payload,
                business_id: business,
                branch_id: branch || null,
                key: payload.key || retryKey,
              },
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.rolledBack) requestKeys.current.delete(signature);
      throw new OperationError(result.error, result.rolledBack === true);
    }
    requestKeys.current.delete(signature);
    await refresh();
    return result;
  }
  return <DailyDesk data={data} business={business} branch={branch} configured={configured} signed={signed}
 online={online} loading={loading} error={sync} from={from} to={to} allBranches={allBranches}
 onAllBranches={setAllBranches} onDates={(from, to) => { setFrom(from); setTo(to); }}
 onBranch={setBranch} onSigned={value => { ++generation.current; setSigned(value); if (!value) { setData(emptyData); setBusiness(""); setBranch(""); setSync(""); } }} refresh={refresh} execute={execute} />;
}

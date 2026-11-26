import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
export function StaticSiteEnvironment({ environmentId, projectId }: {
    environmentId: string;
    projectId: string;
}) {
    const utils = api.useUtils();
    const { data } = api.environment.one.useQuery({ environmentId });
    const create = api.application.create.useMutation();
    const [name, setName] = useState("");
    return <div className="space-y-6 p-6">
  <h1 className="text-2xl font-semibold">Tanıtım Siteleri</h1>
  <p className="text-muted-foreground">Hazır statik site dosyalarını ZIP olarak yayınlayın, kendi alan adınızı bağlayın.</p>
  <form className="flex gap-3 max-w-lg" onSubmit={async (e) => { e.preventDefault(); try {
        await create.mutateAsync({ name: name.trim(), environmentId });
        setName("");
        await utils.environment.one.invalidate({ environmentId });
    }
    catch (error) {
        toast.error(error instanceof Error ? error.message : "Site oluşturulamadı");
    } }}>
   <Input aria-label="Site adı" placeholder="Site adı" required maxLength={100} value={name} onChange={e => setName(e.target.value)}/>
   <Button disabled={create.isPending || !name.trim()}>Statik site oluştur</Button>
  </form>
  <div className="grid gap-4 md:grid-cols-3">{data?.applications.map(app => <Link className="rounded-xl border p-5 hover:bg-muted" key={app.applicationId} href={`/dashboard/project/${projectId}/environment/${environmentId}/services/application/${app.applicationId}`}><h2 className="font-medium">{app.name}</h2><p className="text-sm text-muted-foreground">{app.applicationStatus}</p></Link>)}</div>
 </div>;
}
export function StaticSiteApplication({ applicationId }: {
    applicationId: string;
}) {
    const utils = api.useUtils();
    const { data: app } = api.application.one.useQuery({ applicationId }, { refetchInterval: 5000 });
    const { data: domains } = api.domain.byApplicationId.useQuery({ applicationId });
    const { data: deployments } = api.deployment.all.useQuery({ applicationId }, { refetchInterval: 5000 });
    const upload = api.application.dropDeployment.useMutation();
    const createDomain = api.domain.create.useMutation();
    const redeploy = api.application.redeploy.useMutation();
    const start = api.application.start.useMutation();
    const stop = api.application.stop.useMutation();
    const [zip, setZip] = useState<File | null>(null);
    const [host, setHost] = useState("");
    const [deploymentId, setDeploymentId] = useState("");
    const logs = api.deployment.readLogs.useQuery({ deploymentId }, { enabled: !!deploymentId, refetchInterval: deploymentId ? 5000 : false });
    const act = async (run: () => Promise<unknown>) => { try {
        await run();
        await utils.application.one.invalidate({ applicationId });
    }
    catch (error) {
        toast.error(error instanceof Error ? error.message : "İşlem tamamlanamadı");
    } };
    return <div className="space-y-6 p-6 max-w-4xl">
  <Link className="text-sm underline" href={`/dashboard/project/${app?.environment.projectId}/environment/${app?.environmentId}`}>Sitelerime dön</Link>
  <h1 className="text-2xl font-semibold">{app?.name}</h1>
  <p className="text-muted-foreground">Statik site · {app?.applicationStatus} · Sunucu kodu ve paket kurulum komutları çalıştırılmaz.</p>
  <section className="rounded-xl border p-5 space-y-4"><h2 className="font-semibold">Site dosyalarını yayınla</h2><p className="text-sm text-muted-foreground">Hazırlanmış çıktı klasörünü ZIP olarak yükleyin. Kök dizinde index.html bulunmalı. En fazla 20 MB; PHP, Dockerfile ve kaynak proje dosyaları kabul edilmez.</p>
   <Input type="file" accept=".zip" aria-label="Statik site ZIP dosyası" onChange={e => setZip(e.target.files?.[0] ?? null)}/>
   <div className="flex gap-3"><Button disabled={!zip || upload.isPending} onClick={() => act(async () => { if (!zip || zip.size > 20 * 1024 * 1024)
        throw Error("En fazla 20 MB ZIP yükleyin"); const form = new FormData(); form.append("applicationId", applicationId); form.append("zip", zip); await upload.mutateAsync(form); toast.success("Statik site yayın sırasına alındı"); })}>ZIP yükle ve yayınla</Button><Button variant="outline" disabled={start.isPending} onClick={() => act(() => start.mutateAsync({ applicationId }))}>Başlat</Button><Button variant="outline" disabled={stop.isPending} onClick={() => act(() => stop.mutateAsync({ applicationId }))}>Durdur</Button></div>
  </section>
  <section className="rounded-xl border p-5 space-y-4"><h2 className="font-semibold">Kendi alan adını bağla</h2><p className="text-sm text-muted-foreground">Alan adınızın A kaydını sunucu IP adresine yönlendirin. HTTPS sertifikası otomatik hazırlanır.</p>
   <form className="flex gap-3" onSubmit={e => { e.preventDefault(); void act(async () => { await createDomain.mutateAsync({ applicationId, domainType: "application", host: host.trim().toLowerCase(), port: 8080, path: "/", internalPath: "/", https: true, certificateType: "letsencrypt" }); setHost(""); await utils.domain.byApplicationId.invalidate({ applicationId }); if (app?.applicationStatus === "done") await redeploy.mutateAsync({ applicationId });
                    toast.success("Alan adı eklendi. Yayın tamamlandığında HTTPS bağlantısı kullanılabilir."); }); }}><Input aria-label="Alan adı" placeholder="www.firmaniz.com" required value={host} onChange={e => setHost(e.target.value)}/><Button disabled={createDomain.isPending}>Alan adı bağla</Button></form>
   {domains?.map(domain => <p key={domain.domainId}><a className="underline" href={`https://${domain.host}`} target="_blank" rel="noreferrer">{domain.host}</a></p>)}
  </section>
  <section className="rounded-xl border p-5 space-y-3"><h2 className="font-semibold">Yayın geçmişi</h2>{deployments?.map(deployment => <div key={deployment.deploymentId} className="flex justify-between"><span>{deployment.title} · {deployment.status}</span><Button variant="outline" onClick={() => setDeploymentId(deployment.deploymentId)}>Günlük</Button></div>)}{deploymentId && <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{logs.data ?? "Günlük yükleniyor…"}</pre>}</section>
 </div>;
}

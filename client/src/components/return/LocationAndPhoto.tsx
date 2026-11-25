import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MapView } from "@/components/Map";
import { imageToSanitizedJpegDataUrl } from "@/lib/image";

export function MapPicker({ latitude, longitude, onChange, label = "概略の位置を指定" }: { latitude?: number | null; longitude?: number | null; onChange: (point: { latitude: number; longitude: number } | null) => void; label?: string }) {
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const center = useMemo(() => latitude != null && longitude != null ? { lat: latitude, lng: longitude } : { lat: 35.6812, lng: 139.7671 }, [latitude, longitude]);
  const choose = useCallback((point: { lat: number; lng: number }) => {
    onChange({ latitude: point.lat, longitude: point.lng });
    const map = mapRef.current;
    const L = window.L;
    if (map && L) {
      map.panTo([point.lat, point.lng]);
      if (markerRef.current) markerRef.current.setLatLng([point.lat, point.lng]);
      else markerRef.current = L.marker([point.lat, point.lng]).addTo(map);
    }
  }, [onChange]);
  const handleMapReady = useCallback((map: any) => {
    mapRef.current = map;
    const L = window.L;
    if (L && latitude != null && longitude != null) markerRef.current = L.marker([latitude, longitude]).addTo(map);
  }, [latitude, longitude]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="app-label mb-0">{label}</label>
        {latitude != null && longitude != null && <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-muted-foreground underline">位置を消去</button>}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">地図をタップして地点を選べます。公開時はおよそ1km単位にぼかします。</p>
      <MapView className="h-56" initialCenter={center} initialZoom={latitude != null ? 15 : 11} onMapReady={handleMapReady} onMapClick={choose} label="投稿の場所を選択する地図" />
      {latitude != null && longitude != null && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> 選択済み: {latitude.toFixed(5)}, {longitude.toFixed(5)}</p>}
    </div>
  );
}

export function PhotoUpload({ value, onChange, disabled = false }: { value?: string | null; onChange: (dataUrl: string | null) => void; disabled?: boolean }) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLocalPreview(current => current === value ? current : null); }, [value]);
  const onFile = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("JPEG・PNG・WebP画像を選択してください。");
    if (file.size > 5 * 1024 * 1024) return toast.error("画像サイズは5MB以下にしてください。");
    setBusy(true);
    try {
      const dataUrl = await imageToSanitizedJpegDataUrl(file, 1600, 0.84);
      setLocalPreview(dataUrl);
      onChange(dataUrl);
      toast.success("写真を端末内で安全に処理しました。投稿を送るまではアップロードされません。");
    } catch {
      toast.error("写真を安全に処理できませんでした。形式と通信状態を確認してください。");
    } finally { setBusy(false); }
  };
  const visible = localPreview ?? value ?? null;
  return (
    <div>
      <label className="app-label">品物の写真（任意・5MiB以下）</label>
      <div className="flex flex-wrap items-center gap-3">
        {visible ? <img src={visible} alt="選択した品物" className="h-20 w-24 rounded-lg border border-border object-cover" /> : <div className="flex h-20 w-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground"><ImagePlus className="h-6 w-6" /></div>}
        <div className="flex flex-wrap gap-2">
          <label className="app-button-secondary text-sm" aria-disabled={disabled || busy}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {busy ? "端末内で処理中…" : "写真を選択"}
            <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={event => { void onFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
          {value && <button type="button" onClick={() => { onChange(null); setLocalPreview(null); }} className="app-button-secondary text-sm"><Trash2 className="h-4 w-4" />写真を外す</button>}
        </div>
      </div>
      {disabled && <p className="mt-2 text-xs text-amber-800">写真を選ぶ前に、上の「Manus Storageへ保存」の同意にチェックしてください。</p>}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">端末内で最大1600pxのJPEGへ再圧縮し、EXIF/GPSなどの撮影メタデータを除去します。写真は明示同意後に投稿を送信した場合だけManus Storageへアップロードされ、Manus AI確認を通過して公開同意した場合にのみ公開されます。品物だけを撮影し、顔、氏名、住所、連絡先、カード番号などが写った写真は選ばないでください。</p>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { WebView } from "react-native-webview";
import { colors } from "@/theme";

type Job = { image: string | null; started: number };
const LIMIT = 8 * 1024 * 1024; // Base64 characters; prototype memory guard.
const MAX_MS = 180_000;

function probeHtml(image: string | null): string {
  // The only external resources are pinned OCR runtime and language assets.
  // This probe is restricted to fabricated/anonymous samples, NOT patient records.
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\' https://cdn.jsdelivr.net blob:; worker-src blob:; connect-src https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; img-src data: blob:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
    '<style>body{margin:0;background:#fff}canvas,img{display:block;width:100%;height:auto}</style></head><body>' +
    '<canvas id="sample" width="1250" height="720"></canvas><script>' +
    'const input = ' + JSON.stringify(image) + ';' +
    `
    const send = (value) => window.ReactNativeWebView.postMessage(JSON.stringify(value));
    let worker;
    function sample() {
      const canvas = document.getElementById("sample");
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#111";
      ctx.font = "bold 42px Arial";
      ctx.fillText("ĐƠN THUỐC MẪU - KHÔNG DÙNG ĐIỀU TRỊ", 40, 70);
      ctx.font = "32px Arial";
      const lines = [
        "1. Thuốc A 500 mg",
        "Mỗi lần 1 viên, ngày 2 lần",
        "Sáng, tối sau ăn. Số lượng: 20 viên",
        "2. Thuốc B 10 mg",
        "Mỗi lần 1 viên, ngày 1 lần",
        "Sau ăn. Dùng trong 5 ngày."
      ];
      lines.forEach((line, i) => ctx.fillText(line, 48, 160 + i * 76));
      return canvas;
    }
    async function loadRuntime() {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    async function run() {
      let source;
      if (input) {
        document.getElementById("sample").remove();
        source = new Image();
        source.src = "data:image/jpeg;base64," + input;
        document.body.appendChild(source);
        await source.decode();
      } else {
        source = sample();
      }
      send({type:"progress", status:"loading", progress:0});
      await loadRuntime();
      worker = await Tesseract.createWorker("vie+eng", 1, {
        workerPath:"https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js",
        corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
        langPath:"https://tessdata.projectnaptha.com/4.0.0",
        cacheMethod:"none",
        logger: (m) => send({type:"progress",status:m.status,progress:m.progress}),
        errorHandler: () => send({type:"error"})
      });
      await worker.setParameters({tessedit_pageseg_mode:"3"});
      const result = await worker.recognize(source);
      send({type:"result",text:result.data.text});
    }
    run().catch(() => send({type:"error"})).finally(async () => {
      if (worker) await worker.terminate().catch(() => {});
    });
    ` + '</script></body></html>';
}

function stageLabel(status: unknown) {
  switch (status) {
    case "recognizing text": return "Đang nhận diện chữ";
    case "loading language traineddata": return "Đang tải dữ liệu tiếng Việt và tiếng Anh";
    case "initializing api": return "Đang khởi tạo OCR";
    case "initializing tesseract": return "Đang khởi tạo bộ nhận diện";
    default: return "Đang chuẩn bị bộ nhận diện";
  }
}

export default function OcrProbe() {
  const router = useRouter();
  const [selected, setSelected] = useState<{ uri: string; base64: string } | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [picking, setPicking] = useState(false);
  const pickLock = useRef(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const source = useMemo(() => job ? { html: probeHtml(job.image), baseUrl: "https://localhost/" } : null, [job]);

  useEffect(() => {
    if (!job) return;
    const timer = setTimeout(() => {
      setJob(null);
      setError("Quá thời gian nhận diện. Kiểm tra mạng hoặc thử ảnh nhỏ hơn.");
    }, MAX_MS);
    return () => clearTimeout(timer);
  }, [job]);

  function resetResult() {
    setError("");
    setResult(null);
    setElapsed(null);
    setProgress(null);
  }

  async function pick(camera: boolean) {
    if (job || pickLock.current) return;
    pickLock.current = true;
    setPicking(true);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Quyền camera", "Bạn vẫn có thể chọn ảnh mẫu từ thư viện.");
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], base64: true, quality: 0.85 };
      const output = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (output.canceled) return;
      const asset = output.assets[0];
      if (!asset?.base64 || asset.base64.length > LIMIT || !/^[A-Za-z0-9+/=]+$/.test(asset.base64)) {
        resetResult();
        setSelected(null);
        setError("Ảnh không hợp lệ hoặc quá lớn. Hãy thử ảnh mẫu nhỏ hơn.");
        return;
      }
      resetResult();
      setSelected({uri: asset.uri, base64: asset.base64});
    } catch {
      setError("Không thể mở ảnh. Vui lòng thử lại.");
    } finally {
      pickLock.current = false;
      setPicking(false);
    }
  }

  function start() {
    if (job || picking) return;
    resetResult();
    setStatus("Đang chuẩn bị bộ nhận diện");
    setJob({ image: selected?.base64 ?? null, started: Date.now() });
  }

  function fail() {
    setJob(null);
    setError("Không thể nhận diện ảnh. Hãy kiểm tra kết nối mạng và thử lại.");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.back()}><Text style={styles.secondaryText}>‹ Quay lại</Text></Pressable>
        <Text style={styles.title}>Thử nghiệm OCR</Text>
        <Text style={styles.warning}>Chỉ dùng ảnh đơn thuốc giả lập hoặc đã ẩn danh hoàn toàn. Bản thử nghiệm tải mã OCR từ CDN, chưa được phép xử lý đơn thuốc thật. Không lưu vào Firebase.</Text>
        {selected ? <Image source={{uri: selected.uri}} style={styles.preview} resizeMode="contain"/> :
          <View style={styles.empty}><Text style={styles.body}>Ảnh mẫu tích hợp gồm hai mục thuốc giả lập và hướng dẫn tiếng Việt. Bộ OCR sẽ đọc ảnh thực được vẽ trên canvas.</Text></View>}
        <View style={styles.row}>
          <Pressable accessibilityRole="button" disabled={!!job || picking} style={styles.secondary} onPress={() => void pick(true)}><Text style={styles.secondaryText}>Chụp ảnh mẫu</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!!job || picking} style={styles.secondary} onPress={() => void pick(false)}><Text style={styles.secondaryText}>Chọn ảnh mẫu</Text></Pressable>
        </View>
        {selected && !job && <Pressable style={styles.secondary} onPress={() => {setSelected(null);resetResult();}}><Text style={styles.secondaryText}>Dùng ảnh mẫu tích hợp</Text></Pressable>}
        {!job && <Pressable accessibilityRole="button" disabled={picking} style={styles.primary} onPress={start}><Text style={styles.primaryText}>Bắt đầu nhận diện</Text></Pressable>}
        {job && source && <>
          <ActivityIndicator color={colors.primary}/>
          <Text style={styles.body}>{status}{progress !== null ? " · " + progress + "%" : ""}</Text>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => {setJob(null);setStatus("");setProgress(null);}}><Text style={styles.secondaryText}>Hủy nhận diện</Text></Pressable>
          <WebView
            style={styles.web}
            source={source}
            originWhitelist={["*"]}
            onShouldStartLoadWithRequest={request => request.url === "about:blank" || request.url === "https://localhost/" || request.url === "https://localhost"}
            javaScriptEnabled
            domStorageEnabled={false}
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            incognito
            onError={fail}
            onContentProcessDidTerminate={fail}
            onMessage={event => {
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.type === "progress") {
                  setStatus(stageLabel(message.status));
                  setProgress(message.status === "recognizing text" && typeof message.progress === "number" && Number.isFinite(message.progress) ? Math.round(Math.max(0, Math.min(1, message.progress))*100) : null);
                } else if (message.type === "result" && typeof message.text === "string") {
                  setElapsed((Date.now()-job.started)/1000);
                  setResult(message.text.slice(0, 20000));
                  setJob(null);
                } else if (message.type === "error") fail();
              } catch { fail(); }
            }}
          />
        </>}
        {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
        {result !== null && <View style={styles.empty}>
          <Text style={styles.heading}>Văn bản OCR thực tế</Text>
          <Text style={styles.body}>Thời gian: {elapsed?.toFixed(1)} giây</Text>
          <Text selectable style={styles.body}>{result.trim() || "Không nhận diện được chữ."}</Text>
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  content:{padding:16,gap:12,paddingBottom:28},
  title:{fontSize:24,fontWeight:"800",color:colors.text},
  heading:{fontSize:18,fontWeight:"700",color:colors.text},
  body:{fontSize:16,lineHeight:24,color:colors.text},
  warning:{fontSize:15,lineHeight:22,color:"#854D0E",backgroundColor:"#FEF3C7",padding:12,borderRadius:10},
  row:{flexDirection:"row",flexWrap:"wrap",gap:10},
  secondary:{borderWidth:1,borderColor:colors.border,borderRadius:10,paddingHorizontal:14,minHeight:48,justifyContent:"center",alignItems:"center"},
  secondaryText:{fontSize:15,color:colors.primary,fontWeight:"700"},
  primary:{backgroundColor:colors.primary,borderRadius:12,minHeight:52,alignItems:"center",justifyContent:"center",padding:12},
  primaryText:{color:"white",fontSize:16,fontWeight:"700"},
  preview:{width:"100%",height:220,backgroundColor:"white",borderRadius:10},
  empty:{backgroundColor:"white",borderWidth:1,borderColor:colors.border,borderRadius:12,padding:14,gap:8},
  web:{height:260,backgroundColor:"white",flex:0},
});

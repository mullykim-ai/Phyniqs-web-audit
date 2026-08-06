import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { PhyniqsClient, type ScanPage, type ScanResult } from "@phyniqs/core";

const API_KEY = "phyniqs.native.api";
const TOKEN_KEY = "phyniqs.native.token";
const defaultApi = "https://scanner-api-production-1a02.up.railway.app";

export default function App() {
  const [apiUrl, setApiUrl] = useState(defaultApi); const [token, setToken] = useState("");
  const [siteUrl, setSiteUrl] = useState("https://example.com"); const [risky, setRisky] = useState("");
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [result, setResult] = useState<ScanResult | null>(null);
  useEffect(() => { void Promise.all([SecureStore.getItemAsync(API_KEY), SecureStore.getItemAsync(TOKEN_KEY)]).then(([api, secret]) => { if (api) setApiUrl(api); if (secret) setToken(secret); }); }, []);
  const client = useMemo(() => { try { return new PhyniqsClient({ baseUrl: apiUrl, accessToken: token }); } catch { return null; } }, [apiUrl, token]);
  async function scan() {
    if (!client) return Alert.alert("Connection required", "Enter the Phyniqs API address and native access token.");
    setBusy(true); setResult(null); setProgress(0);
    try {
      await Promise.all([SecureStore.setItemAsync(API_KEY, apiUrl), SecureStore.setItemAsync(TOKEN_KEY, token)]);
      const job = await client.createScan({ url: siteUrl, maxPages: 100, riskyFonts: risky.split(",").map(x => x.trim()).filter(Boolean), debugMode: true });
      const complete = await client.waitForScan(job.id, scanResult => { setResult(scanResult); setProgress(scanResult.progress); });
      setResult(complete);
    } catch (error) { Alert.alert("Scan failed", error instanceof Error ? error.message : "Unable to complete scan"); } finally { setBusy(false); }
  }
  const riskyPages = result?.pages.filter(page => page.riskCount > 0) ?? [];
  return <SafeAreaView style={styles.safe}><StatusBar style="light"/><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.brand}><Text style={styles.mark}>◢</Text><View><Text style={styles.brandName}>Phyniqs</Text><Text style={styles.brandSub}>MOBILE TYPOGRAPHY INTELLIGENCE</Text></View></View>
    <Text style={styles.hero}>Scan every page.{"\n"}<Text style={styles.lime}>Find every font.</Text></Text>
    <View style={styles.card}><Text style={styles.kicker}>SECURE CONNECTION</Text><Field label="API gateway" value={apiUrl} onChangeText={setApiUrl}/><Field label="Native access token" value={token} onChangeText={setToken} secureTextEntry/></View>
    <View style={styles.card}><Text style={styles.kicker}>NEW PLAYWRIGHT SCAN</Text><Field label="Website URL" value={siteUrl} onChangeText={setSiteUrl} autoCapitalize="none" keyboardType="url"/><Field label="Risky fonts (comma-separated)" value={risky} onChangeText={setRisky} placeholder="Arial, Helvetica"/><Pressable style={[styles.action,busy&&styles.disabled]} disabled={busy} onPress={scan}>{busy?<View style={styles.actionRow}><ActivityIndicator color="#071104"/><Text style={styles.actionText}> SCANNING · {progress}%</Text></View>:<Text style={styles.actionText}>LAUNCH FULL SCAN →</Text>}</Pressable></View>
    <View style={styles.metrics}><Metric label="PAGES" value={result?.pages.length ?? 0}/><Metric label="FONTS" value={result?.fonts.length ?? 0}/><Metric label="RISKS" value={result?.riskCount ?? 0} risk/></View>
    {result?.fonts.length ? <View style={styles.card}><Text style={styles.kicker}>DISCOVERED FONTS</Text><View style={styles.chips}>{result.fonts.map(font=><Text key={font} style={styles.chip}>{font}</Text>)}</View></View>:null}
    {riskyPages.length ? <View style={styles.card}><Text style={styles.kicker}>RISK EVIDENCE</Text><FlatList scrollEnabled={false} data={riskyPages} keyExtractor={item=>item.url} renderItem={({item})=><RiskPage page={item}/>} /></View>:null}
  </ScrollView></SafeAreaView>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { const {label,...input}=props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} placeholderTextColor="#555" style={styles.input}/></View>; }
function Metric({label,value,risk=false}:{label:string;value:number;risk?:boolean}) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue,risk&&value>0&&styles.red]}>{value}</Text></View>; }
function RiskPage({page}:{page:ScanPage}) { return <View style={styles.riskPage}><View style={styles.riskTop}><Text numberOfLines={1} style={styles.pageTitle}>{page.title}</Text><Text style={styles.red}>{page.riskCount} risks</Text></View><Text numberOfLines={1} style={styles.url}>{page.url}</Text>{page.screenshotUrl?<Pressable onPress={()=>Linking.openURL(page.screenshotUrl!)}><Text style={styles.evidence}>OPEN HIGHLIGHTED SCREENSHOT ↗</Text></Pressable>:null}</View>; }
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:"#000"},content:{padding:20,paddingBottom:50},brand:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:35},mark:{color:"#51ff00",fontSize:30},brandName:{color:"#fff",fontSize:19,fontWeight:"800"},brandSub:{color:"#666",fontSize:7,letterSpacing:1.2},hero:{color:"#fff",fontSize:35,lineHeight:41,fontWeight:"800",marginBottom:25},lime:{color:"#51ff00"},card:{backgroundColor:"#080808",borderWidth:1,borderColor:"#242424",padding:18,marginBottom:12},kicker:{color:"#51ff00",fontSize:8,letterSpacing:1.4,fontWeight:"700",marginBottom:15},field:{marginBottom:13},label:{color:"#999",fontSize:10,marginBottom:7},input:{height:46,borderWidth:1,borderColor:"#333",backgroundColor:"#0e0e0e",color:"#fff",paddingHorizontal:12,fontSize:13},action:{height:48,backgroundColor:"#51ff00",alignItems:"center",justifyContent:"center",marginTop:4},disabled:{opacity:.6},actionText:{color:"#071104",fontSize:11,fontWeight:"800"},actionRow:{flexDirection:"row",alignItems:"center"},metrics:{flexDirection:"row",borderWidth:1,borderColor:"#242424",marginBottom:12},metric:{flex:1,padding:15,borderRightWidth:1,borderRightColor:"#242424"},metricLabel:{color:"#666",fontSize:8},metricValue:{color:"#fff",fontSize:25,fontWeight:"700",marginTop:6},red:{color:"#ff4452"},chips:{flexDirection:"row",flexWrap:"wrap",gap:7},chip:{color:"#ddd",borderWidth:1,borderColor:"#333",paddingVertical:6,paddingHorizontal:9,fontSize:10},riskPage:{borderTopWidth:1,borderTopColor:"#312022",paddingVertical:13},riskTop:{flexDirection:"row",justifyContent:"space-between",gap:10},pageTitle:{color:"#fff",fontSize:11,fontWeight:"700",flex:1},url:{color:"#666",fontSize:8,marginTop:5},evidence:{color:"#51ff00",fontSize:9,fontWeight:"700",marginTop:10}});

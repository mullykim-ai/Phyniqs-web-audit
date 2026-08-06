import{describe,expect,it}from"vitest";import{validateStoreTarget}from"../src/store-policy.js";

describe("store listing URL policy",()=>{
  it("accepts official Apple App Store URLs",()=>{expect(validateStoreTarget("https://apps.apple.com/us/app/example/id123456","APP_STORE").hostname).toBe("apps.apple.com")});
  it("accepts official Google Play app URLs",()=>{expect(validateStoreTarget("https://play.google.com/store/apps/details?id=com.example","PLAY_STORE").pathname).toBe("/store/apps/details")});
  it("rejects a store type mismatch",()=>{expect(()=>validateStoreTarget("https://play.google.com/store/apps/details?id=com.example","APP_STORE")).toThrow("apps.apple.com")});
  it("rejects lookalike hosts",()=>{expect(()=>validateStoreTarget("https://apps.apple.com.attacker.example/app/id1","APP_STORE")).toThrow()});
  it("rejects insecure listing URLs",()=>{expect(()=>validateStoreTarget("http://apps.apple.com/app/id1","APP_STORE")).toThrow("HTTPS")});
});

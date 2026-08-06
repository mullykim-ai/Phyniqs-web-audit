const nonPageExtensions=new Set([
  "7z","aac","atom","avi","avif","bmp","bz2","csv","doc","docx","eot","epub","exe","flac","gif","gz","ico","ics","iso","jpeg","jpg","json","m4a","m4v","mkv","mov","mp3","mp4","mpeg","mpg","msi","odp","ods","odt","ogg","ogv","otf","pdf","png","ppt","pptx","rar","rss","rtf","svg","tar","tgz","tif","tiff","ttf","txt","wav","webm","webp","woff","woff2","xls","xlsx","xml","zip"
]);

export function isCrawlablePageUrl(url:URL){
  const segment=url.pathname.split("/").pop()||"";
  const match=/\.([a-z0-9]{1,8})$/i.exec(segment);
  return !match||!nonPageExtensions.has(match[1].toLowerCase());
}

export function isHtmlContentType(contentType:string){
  const normalized=contentType.toLowerCase().split(";",1)[0].trim();
  return normalized==="text/html"||normalized==="application/xhtml+xml";
}

export function isDownloadNavigationError(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  return /download is starting/i.test(message);
}

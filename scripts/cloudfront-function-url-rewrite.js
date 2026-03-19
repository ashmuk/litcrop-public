// CloudFront Function: litcrop-poc-url-rewrite
// Runtime: cloudfront-js-2.0
// Association: Viewer request on default behavior
//
// Purpose: Rewrite directory requests to index.html for Astro SSG routes.
// S3 REST API (used with OAC) does not auto-resolve /path/ → /path/index.html
// like S3 static website hosting does. This function handles that rewrite.
//
// Deployed via AWS Console → CloudFront → Functions → Create function.
// Then associated: Distributions → EXXXXXXXXXXXXX → Behaviors → Default → Edit →
//   Function associations → Viewer request → CloudFront Functions → litcrop-poc-url-rewrite

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}

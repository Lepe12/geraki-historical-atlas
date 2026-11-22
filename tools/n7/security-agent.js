'use strict';
// Offline, deterministic, read-only security posture assessment.
// No network access, shell commands, credentials, scanning, or exploitation.
const FIELDS=['strict-transport-security','content-security-policy','x-content-type-options','referrer-policy','x-frame-options','permissions-policy'];
function auditHeaders(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_SECURITY_INPUT');
 const entries=Object.entries(input);
 if(entries.length>80||JSON.stringify(input).length>16000)throw Error('SECURITY_INPUT_TOO_LARGE');
 const h=Object.create(null);
 for(const [name,value] of entries){
  if(!/^[a-z0-9-]{1,80}$/i.test(name)||typeof value!=='string'||value.length>2000)throw Error('INVALID_SECURITY_HEADER');
  h[name.toLowerCase()]=value.trim();
 }
 const findings=[];
 function add(id,severity,reason,recommendation){findings.push({id,severity,reason,recommendation});}
 const hsts=h['strict-transport-security'];
 if(!hsts)add('HSTS_MISSING','medium','Strict-Transport-Security header absent','Set HSTS on HTTPS origins after checking subdomains and rollout impacts');
 else if(!/\bmax-age\s*=\s*\d+/i.test(hsts))add('HSTS_INVALID','medium','HSTS has no valid max-age','Use max-age with an intentional expiry');
 if(!h['content-security-policy'])add('CSP_MISSING','medium','Content-Security-Policy header absent','Deploy a tested Content-Security-Policy tailored to the application');
 if((h['x-content-type-options']||'').toLowerCase()!=='nosniff')add('NOSNIFF_MISSING','low','X-Content-Type-Options not set to nosniff','Set X-Content-Type-Options: nosniff');
 if(!h['referrer-policy'])add('REFERRER_POLICY_MISSING','low','Referrer-Policy header absent','Select an appropriate Referrer-Policy, such as strict-origin-when-cross-origin');
 if(!h['x-frame-options']&&!/\bframe-ancestors\b/i.test(h['content-security-policy']||''))add('FRAME_GUARD_MISSING','medium','No X-Frame-Options or CSP frame-ancestors','Protect against unwanted embedding with CSP frame-ancestors');
 if(!h['permissions-policy'])add('PERMISSIONS_POLICY_MISSING','info','Permissions-Policy header absent','Consider restricting browser capabilities where appropriate');
 const counts={medium:0,low:0,info:0};for(const f of findings)counts[f.severity]++;
 return {schema:'n7-security-headers-audit-v1',mode:'OFFLINE_PASSIVE',scope:'SUPPLIED_HEADERS_ONLY',
  checked:FIELDS,findings,counts,limitations:['Headers were supplied by caller and have not been fetched or verified','Not a vulnerability scan or penetration test','A missing header does not by itself prove exploitable vulnerability']};
}
module.exports={auditHeaders};

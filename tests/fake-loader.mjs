// Pro testy: firebase-admin a web-push se nahradí verzemi v paměti (tests/fakes), nic se nestahuje.
import { register } from 'node:module';
register('./fake-resolve.mjs', import.meta.url);

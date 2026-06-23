arhansubasi@Arhan-MacBook-Air api-server % curl -s -H "X-API-Key: aitm_de2838b5ce0e0b
0ba02cb4ebf6dd4d2c91865bfbfa57678b" \
>   http://localhost:3001/v1/repositories/repo_1770144631236_4m5w6yn5 | jq .
{
  "id": "repo_1770144631236_4m5w6yn5",
  "project_id": "proj_1770143401235_d1101a26",
  "name": "express",
  "root_path": "/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express",
  "status": "indexing",
  "progress": {
    "files_total": 182,
    "files_indexed": 0,
    "percent": 0
  },
  "stats": {
    "file_count": 0,
    "symbol_count": 0,
    "language_breakdown": {
      "unknown": 27,
      "javascript": 44
    },
    "symbol_type_breakdown": {
      "function": 46,
      "class": 2,
      "interface": 1,
      "type": 14,
      "constant": 1
    }
  },
  "last_indexed_at": null,
  "created_at": "2026-02-03T18:50:31.236Z",
  "updated_at": "2026-02-03T18:50:32.617Z",
  "metadata": {
    "url": "https://github.com/expressjs/express",
    "branch": "main",
    "isGitHub": true
  },
  "error": null
}arhansubasi@Arhan-MacBook-Air api-server % sleep 20 ; curl -s -H "X-API-Key: aitm_de2
838b5ce0e0b0ba02cb4ebf6dd4d2c91865bfbfa57678b" "http://localhost:3001/v1/repositories
/repo_1770144631236_4m5w6yn5"
{"id":"repo_1770144631236_4m5w6yn5","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","status":"completed","progress":{"files_total":182,"files_indexed":182,"percent":100},"stats":{"file_count":182,"symbol_count":272,"language_breakdown":{"unknown":41,"javascript":141},"symbol_type_breakdown":{"function":235,"class":2,"interface":1,"type":16,"constant":18}},"last_indexed_at":"2026-02-03T18:53:18.184Z","created_at":"2026-02-03T18:50:31.236Z","updated_at":"2026-02-03T18:53:18.184Z","metadata":{"url":"https://github.com/expressjs/express","branch":"main","isGitHub":true},"error":null}%     
arhansubasi@Arhan-MacBook-Air api-server % rhansubasi@Arhan-MacBook-Air api-server % curl -s -H "X-API-Key: aitm_de2838b5ce0e0b
0ba02cb4ebf6dd4d2c91865bfbfa57678b" http://localhost:3001/v1/knowledge-base/repositor
ies
{"repositories":[{"id":"repo_1770144631236_4m5w6yn5","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","index_status":"completed","last_indexed_at":"2026-02-03T18:53:18.184Z","kb_files":"182","updated_at":"2026-02-03T18:53:18.184Z"},{"id":"repo_1770144541704_intabozh","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","index_status":"failed","last_indexed_at":null,"kb_files":"10","updated_at":"2026-02-03T18:49:10.475Z"},{"id":"repo_1770144034218_a2sd9e2r","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","index_status":"failed","last_indexed_at":null,"kb_files":"10","updated_at":"2026-02-03T18:40:43.123Z"},{"id":"repo_1770144028733_ucib8o8c","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","index_status":"failed","last_indexed_at":null,"kb_files":"10","updated_at":"2026-02-03T18:40:37.934Z"},{"id":"repo_1770143946194_i0wuda8h","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:39:08.134Z"},{"id":"repo_1770143853254_tbfvwi2i","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:37:35.106Z"},{"id":"repo_1770143728900_7kae7uru","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:35:30.754Z"},{"id":"repo_1770143722404_4tcnn43m","project_id":"proj_1770143401235_d1101a26","name":"express","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/expressjs/express","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:35:24.237Z"},{"id":"repo_1770143696241_3q603grj","project_id":"proj_1770143401235_d1101a26","name":"is-odd","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/sindresorhus/is-odd","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:34:56.976Z"},{"id":"repo_1770143688348_e7d9kl4m","project_id":"proj_1770143401235_d1101a26","name":"is-odd","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/sindresorhus/is-odd","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:34:49.099Z"},{"id":"repo_1770143681895_thdlxsu1","project_id":"proj_1770143401235_d1101a26","name":"is-odd","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/sindresorhus/is-odd","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:34:42.752Z"},{"id":"repo_1770143644493_2duksjcv","project_id":"proj_1770143401235_d1101a26","name":"react","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/facebook/react","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:34:04.806Z"},{"id":"repo_1770143609394_z8ii1pr9","project_id":"proj_1770143401235_d1101a26","name":"react","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/facebook/react","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:33:29.707Z"},{"id":"repo_1770143583987_qv9gyv8k","project_id":"proj_1770143401235_d1101a26","name":"react","root_path":"/tmp/aitm-repos/user_1770143399923_336dc813/facebook/react","index_status":"failed","last_indexed_at":null,"kb_files":"0","updated_at":"2026-02-03T18:33:09.107Z"}],"total":14}%            
arhansubasi@Arhan-MacBook-Air api-server % 
arhansubasi@Arhan-MacBook-Air api-server % curl -s -X POST -H "X-API-Key: aitm_de2838
b5ce0e0b0ba02cb4ebf6dd4d2c91865bfbfa57678b" -H "Content-Type: application/json" -d '{
"query":"router","limit":5}' http://localhost:3001/v1/universal-search
{"query":"router","search_mode":"unified","sources":["code","knowledge_base","artifact","context","message"],"data":[{"id":"77302912-1ca8-45a4-975b-ebf3aff83cc4","source":"knowledge_base","score":19.061211125529063,"title":"app.router.js","snippet":"ire('../lib/utils').methods;\n\nvar shouldSkipQuery = require('./support/utils').shouldSkipQuery\n\ndescribe('app.router', function () {\n  it('should restore req.params after leaving router', function (done) {\n    var app = expres","match_offsets":[{"field":"content","start":110,"end":116}],"metadata":{"file_path":"test/app.router.js","language":"javascript","repository_id":"repo_1770144631236_4m5w6yn5","project_id":"proj_1770143401235_d1101a26","content_hash":"b0561e5e39046b594519e6e61e1b4d57ee4dcdcdb97772d2884cced3617b023d","size":29831,"timestamp":"2026-02-03T18:52:17.197Z"}},{"id":"22c10aa2-71f4-4f95-8c3f-d17d37a4a89b","source":"knowledge_base","score":19.0611949036009,"title":"multi-router.js","snippet":"var app = require('../../examples/multi-router')\nvar request = require('supertest')\n\ndescribe('multi-router', function(){\n  describe('GET /',function(){\n   ","match_offsets":[{"field":"content","start":40,"end":46}],"metadata":{"file_path":"test/acceptance/multi-router.js","language":"javascript","repository_id":"repo_1770144631236_4m5w6yn5","project_id":"proj_1770143401235_d1101a26","content_hash":"62ebf8ac4e00790b6d2db04baa85be064eeb31d6da6b63ba4669f6d558bd70e6","size":1173,"timestamp":"2026-02-03T18:51:56.165Z"}},{"id":"3e30cbfb-440d-428a-a4ab-e2ea0d0d49f7","source":"knowledge_base","score":19.06118881578402,"title":"Router.js","snippet":"'use strict'\n\nvar after = require('after');\nvar express = require('../')\n  , Router = express.Router\n  , methods = require('../lib/utils').methods\n  , assert = require('node:assert');\n\ndescribe","match_offsets":[{"field":"content","start":77,"end":83}],"metadata":{"file_path":"test/Router.js","language":"javascript","repository_id":"repo_1770144631236_4m5w6yn5","project_id":"proj_1770143401235_d1101a26","content_hash":"721ffc840d1c4aad931d859a661c98f07eb56389f1c3a1902cb06fae4d4c0c32","size":17372,"timestamp":"2026-02-03T18:51:48.274Z"}},{"id":"ac796a48-44e1-48f1-8cd8-0fccd0743664","source":"knowledge_base","score":8.459232344892165,"title":"req.baseUrl.js","snippet":"    })\n\n    it('should contain lower path', function(done){\n      var app = express()\n      var sub = express.Router()\n\n      sub.get('/:b', function(req, res){\n        res.end(req.baseUrl)\n      })\n      app.use('/:a', sub)\n\n","match_offsets":[{"field":"content","start":110,"end":116}],"metadata":{"file_path":"test/req.baseUrl.js","language":"javascript","repository_id":"repo_1770144631236_4m5w6yn5","project_id":"proj_1770143401235_d1101a26","content_hash":"e20c9aa41f9e1cad5676ab4df70412be4847a20b9473947eba3e09849bd66810","size":2120,"timestamp":"2026-02-03T18:52:44.703Z"}},{"id":"54ec73b7-5977-4928-ab59-941aa491d148","source":"knowledge_base","score":8.459216731349601,"title":"exports.js","snippet":"ss = require('../');\nvar request = require('supertest');\n\ndescribe('exports', function(){\n  it('should expose Router', function(){\n    assert.strictEqual(typeof express.Router, 'function')\n  })\n\n  it('should expose json middle","match_offsets":[{"field":"content","start":110,"end":116}],"metadata":{"file_path":"test/exports.js","language":"javascript","repository_id":"repo_1770144631236_4m5w6yn5","project_id":"proj_1770143401235_d1101a26","content_hash":"4d8389207f6b4693dc5792f79f61f719a70389fe1900c04c83ff31ef06b07001","size":2344,"timestamp":"2026-02-03T18:52:24.461Z"}}],"pagination":{"total":10,"limit":5,"offset":0,"has_more":true}}%                                                         
arhansubasi@Arhan-MacBook-Air api-server % 
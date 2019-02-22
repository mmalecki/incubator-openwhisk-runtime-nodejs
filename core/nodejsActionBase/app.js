/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var config = {
        'port': 8080,
        'apiHost': process.env.__OW_API_HOST,
        'allowConcurrent': process.env.__OW_ALLOW_CONCURRENT
};

var http = require('http');
var bodyParser = require('body-parser').json({ limit: "48mb" });

var server = http.createServer(handleRequest);


/**
 * instantiate an object which handles REST calls from the Invoker
 */
var service = require('./src/service').getService(config);
var initEndpoint = wrapEndpoint(service.initCode)
var runEndpoint = wrapEndpoint(service.runCode)

service.start(server);

function handleRequest(req, res) {
    if (req.method !== 'POST')
        return replyWithJson(res, 415, { error: 'Method Not Allowed' })

    bodyParser(req, res, function () {
        if (req.url === '/init') return initEndpoint(req, res)
        else if (req.url === '/run') return runEndpoint(req, res);
        else return replyWithJson(res, 404, { error: 'Not Found' })
    });
}

function replyWithJson(res, statusCode, body) {
    res.writeHead(statusCode, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
}

/**
 * Wraps an endpoint written to return a Promise into an express endpoint,
 * producing the appropriate HTTP response and closing it for all controlable
 * failure modes.
 *
 * The expected signature for the promise value (both completed and failed)
 * is { code: int, response: object }.
 *
 * @param ep a request=>promise function
 * @returns an express endpoint handler
 */
function wrapEndpoint(ep) {
    return function (req, res) {
        try {
            ep(req).then(function (result) {
                replyWithJson(res, result.code, result.response)
            }).catch(function (error) {
                if (typeof error.code === "number" && typeof error.response !== "undefined") {
                    replyWithJson(res, error.code, error.response)
                } else {
                    console.error("[wrapEndpoint]", "invalid errored promise", JSON.stringify(error));
                    replyWithJson(res, 500, { error: "Internal error." });
                }
            });
        } catch (e) {
            // This should not happen, as the contract for the endpoints is to
            // never (externally) throw, and wrap failures in the promise instead,
            // but, as they say, better safe than sorry.
            console.error("[wrapEndpoint]", "exception caught", e.message);

            replyWithJson(res, 500, { error: "Internal error (exception)." });
        }
    }
}

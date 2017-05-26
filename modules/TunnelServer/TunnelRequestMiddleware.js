var Tunnel = require('./../Tunnel');
var DefaulRequest = require('../DefaultRequest');
var TunnelHttpRequestor = require('./TunnelHttpRequestor');
var TunnelMessage = require('./../Tunnel/TunnelMessage');
var TunnelLogger = require('../TunnelLogger');

var url = require("url");
var fs = require("fs");
var path = require("path");

var mustache = require('mustache');

var TunnelRequestMiddleware = {

    notAllowedHeaders: [
        'accept-encoding'
    ],
    request: null,
    response: null,
    lastRequest: null,
    requestObject: null,
    lastRequestObject: null,

    removeHeaders: function (request) {
        for (var index in this.notAllowedHeaders) {
            var header = this.notAllowedHeaders[index];

            if (request.headers.hasOwnProperty(header)) {
                delete request.headers[header];
            }
        }

        if (request.headers.hasOwnProperty('host')) {
            /**
             * Se for localhost remove porque a maioria das locadoras dão erro de resposta http
             */
            if (request.headers['host'].match('localhost')) {
                delete request.headers['host'];
            }

        }


        if (request.headers.hasOwnProperty('referer')) {

            if (request.headers['referer'].match('localhost')) {
                var referer = request.headers['referer'];
                request.headers['referer'] = referer.replace('http://localhost:' + Tunnel.configs.httpPort + '/', '');
            } else if (request.headers['referer'].match('tunnel.rentcars')) {
                var referer = request.headers['referer'];
                request.headers['referer'] = referer.replace('http://tunnel.rentcars.lan:' + Tunnel.configs.httpPort + '/', '');
            }
        }

        return request;
    },
    logRequest: function (textFlag, request) {
        if (request instanceof DefaulRequest) {
            var method = request.getMethod();
            var requestedUrl = request.getRequestedUrl();
            var headers = request.getHeaders();
            var body = request.getBody();
        } else {
            var method = request.method;
            var requestedUrl = request.url.slice(1, request.length);
            var headers = request.headers;
            var body = request.body;
        }


        console.log(Tunnel.consoleFlag + ' +----------------------------------- ');
        console.log(Tunnel.consoleFlag + ' | ' + textFlag + ' BEGIN ');
        console.log(Tunnel.consoleFlag + ' +----------------------------------- ');
        console.log(Tunnel.consoleFlag + ' Method:', method);
        console.log(Tunnel.consoleFlag + ' Requested Url:', requestedUrl);
        console.log(Tunnel.consoleFlag + ' Headers:');
        console.log(headers);
        console.log(Tunnel.consoleFlag + ' Body:', body);
        console.log(Tunnel.consoleFlag + ' +----------------------------------- ');
        console.log(Tunnel.consoleFlag + ' | ' + textFlag + ' END ');
        console.log(Tunnel.consoleFlag + ' +----------------------------------- ');
    },
    applyParentProperties: function (request) {
        /**
         * Só aplica se tiver uma requisição completa
         */
        if (TunnelRequestMiddleware.lastRequestObject != null && TunnelRequestMiddleware.lastRequestObject.getRequestedUrl() != '') {
            var lastUrl = TunnelRequestMiddleware.lastRequestObject.getRequestedUrl();
            var lastRequestObject = TunnelRequestMiddleware.parseUrl(lastUrl);

            if (request.url[0] == '/') {
                var requestedUrl = request.url.slice(1, request.length);
            } else {
                var requestedUrl = request.url;
            }
            var currentRequestObject = TunnelRequestMiddleware.parseUrl(requestedUrl);


            console.log('------------------------------------ ');
            console.log(Tunnel.consoleFlag + ' Call: TunnelRequestMiddleware.applyParentProperties(request)');
            console.log('------------------------------------ ');
            console.log('lastUrl', lastUrl);
            console.log('request.url', request.url);
            console.log('lastRequestObject', lastRequestObject);
            console.log('currentRequestObject', currentRequestObject);
            console.log('request.headers.referer', request.headers.referer);
            console.log('lastRequest.headers.referer', TunnelRequestMiddleware.lastRequest.headers.referer);
            console.log('------------------------------------ ');

            /**
             * Não funciona bem para navegação cruzada, aonde temos várias abas abertas,
             * A classe perde a referência do pai
             */
            /**
             * Só aplica se não encontrar a o host da requisicao atual
             * e se o protocolo for igual
             */
            if (currentRequestObject.host == null) {

                if (request.url[0] == '/') {
                    request.url = lastRequestObject.protocol + '//' + lastRequestObject.host + request.url;
                } else {
                    request.url = lastRequestObject.protocol + '//' + lastRequestObject.host + '/' + request.url;
                }

            }
        }
        console.log('------------------------------------ ');
        console.log('Result: ');
        console.log('------------------------------------ ');
        console.log(request.url, request.headers);
        console.log('------------------------------------ ');

        return request;
    },
    applyHeaders: function (request) {
        if (request.url[0] == '/') {
            var requestedUrl = request.url.slice(1, request.length);
        } else {
            var requestedUrl = request.url;
        }
        var requestObject = TunnelRequestMiddleware.parseUrl(requestedUrl);

        if (requestObject.hasOwnProperty('hostname') && requestObject.hostname != '') {
            request.headers['host'] = requestObject.hostname;
        }

        return request;
    },
    checkIfIsFile: function (request) {

        var file = this.getFile(request);

        return (file != null);
    },
    getFile: function (request) {
        if (request.url[0] == '/') {
            var requestedUrl = request.url.slice(1, request.length);
        } else {
            var requestedUrl = request.url;
        }

        var requestObject = TunnelRequestMiddleware.parseUrl(requestedUrl);

        var pathname = requestObject.pathname;
        var file = null;

        try {
            file = fs.readFileSync(path.join(__dirname, '../../public', pathname));
        } catch (error) {
            /**
             * Não é necessário tratar essa exception, pois apenas testa se o arquivo existe
             */
            //Tunnel.treatException(error);
        }

        return file;
    },
    process: function (request, response) {


        if (this.checkIfIsFile(request)) {
            response.end(this.getFile(request));
        }

        //if (Tunnel.configs.debug) {
        console.log('------------------------------------ ');
        console.log(Tunnel.consoleFlag + ' Call: TunnelRequestMiddleware.process(request, response)');
        console.log('------------------------------------ ');
        console.log('REQUEST BEGIN ');
        console.log('------------------------------------ ');
        //}

        this.request = request;
        this.response = response;

        this.logRequest('Original Request:', request);

        request = this.removeHeaders(request);

        /**
         * Se for uma pesquisa que está pegando subitens então aplica parametros, por exemplo o caso do google:
         * Requisição Inicial:
         * http://www.google.com/
         *
         * Sub-requisições:
         * /textinputassistant/tia.png
         *
         * /client_204?&atyp=i&biw=1920&bih=463&ei=RvnkWJzgK4KfwASJ-Y-gAQ
         *
         */
        request = this.applyParentProperties(request);

        var method = request.method;

        if (request.url.match('/http') || request.url[0] == '/') {
            var requestedUrl = request.url.slice(1, request.length);
        } else {
            var requestedUrl = request.url;
        }

        /**
         * Aplica os headers necessários
         */
        request = this.applyHeaders(request);

        var headers = request.headers;
        var body = request.body;


        var requestObject = new DefaulRequest();
        requestObject.setRequestedUrl(requestedUrl);
        requestObject.setMethod(method);
        requestObject.setHeaders(headers);
        requestObject.setBody(body);

        this.requestObject = requestObject;

        this.logRequest('Parsed Request:', requestObject);

        try {
            this.executeHttpRequest(requestObject, response);
            //throw new Error('Deu alguma zica Aqui');
        } catch (e) {
            Tunnel.treatException(e);
            this.getErrorPage(response, e);
        }

    },

    executeHttpRequest: function (requestObject, response) {

        TunnelHttpRequestor.configs = Tunnel.configs;
        TunnelHttpRequestor.execute(requestObject, response, this.responseCallback);
    },
    /**
     * Show The error Page
     * @param response
     * @param error
     */
    getErrorPage: function (response, error) {
        var errorPage = fs.readFileSync(path.join(__dirname, '../../public', 'error.html'));

        errorPage = mustache.render(errorPage.toString(), new TunnelMessage(error.code, error.message));

        response.setHeader('Content-Type', 'text/html');
        response.end(errorPage);
    },
    /**
     *
     * @param ServerResponse response
     * @param Object headers
     */
    overrideHeaders: function (response, headers) {
        try {
            for (var key in headers) {
                /**
                 * Debug
                 */
                if (Tunnel.configs.debug) {
                    console.log('DEBUG');
                    console.log('key:', key);
                    console.log('response value:', response.getHeader(key));
                    console.log('output headers value:', headers[key]);
                    console.log('');
                }

                if (!response.getHeader(key)) {
                    response.setHeader(key, headers[key]);
                }
            }
        } catch (e) {
            Tunnel.treatException(e);
        }
    },
    /**
     *
     * @param requestedUrl
     * @returns Url
     */
    parseUrl: function (requestedUrl) {
        return url.parse(requestedUrl);
    },
    /**
     *
     * @param Error|null error
     * @param ServerResponse result
     * @param ServerResponse response
     */
    responseCallback: function (error, result, response) {
        /**
         * Sobreescreve a response
         */
        this.response = response;


        console.log('----------------------------------- ');
        console.log(Tunnel.consoleFlag + ' Call: TunnelRequestMiddleware.responseCallback(error, result, response)');
        console.log('----------------------------------- ');

        console.log(Tunnel.consoleFlag + '+----------------------------------- ');
        console.log(Tunnel.consoleFlag + '| Response');
        console.log(Tunnel.consoleFlag + '+----------------------------------- ');
        if (error) {

            console.log(Tunnel.consoleFlag + ' Error Code: ' + error.code);
            console.log(Tunnel.consoleFlag + ' Error Message: ' + error.message);

            TunnelRequestMiddleware.getErrorPage(response, error);
        } else {

            var statusCode = result.statusCode;
            var statusMessage = result.statusMessage;
            var headers = result.headers;
            var body = result.body;


            console.log(Tunnel.consoleFlag + ' Status Code:', statusCode);
            console.log(Tunnel.consoleFlag + ' Status Message:', statusMessage);
            console.log(Tunnel.consoleFlag + ' Headers:');
            console.log(headers);


            if (result.hasOwnProperty('body')) {
                var requestObject = TunnelRequestMiddleware.parseUrl(TunnelRequestMiddleware.requestObject.getRequestedUrl());
                /**
                 * Armazena a ultima request que possui todos os params
                 * @type DefaultRequest
                 */
                if (requestObject.hasOwnProperty('protocol') && requestObject['protocol'] != null
                    && requestObject.hasOwnProperty('host') && requestObject['host'] != null) {

                    TunnelRequestMiddleware.lastRequestObject = TunnelRequestMiddleware.requestObject;
                    TunnelRequestMiddleware.lastRequest = TunnelRequestMiddleware.request;
                }


                TunnelRequestMiddleware.overrideHeaders(response, headers);

                response.body = body;
                response.end(body);


            } else {
                //Tratar errors específicos aqui
                response.end('Verificar tivemos problemas');

            }


            console.log('------------------------------------ ');
            console.log('REQUEST END ');
            console.log('------------------------------------ ');


        }
    }
};

module.exports = TunnelRequestMiddleware;
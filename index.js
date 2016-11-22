var mime = require("mime");
var express = require("express");

module.exports = staticGzip;

/**
 * Generates a middleware function to serve static files. It is build on top of the express.static middleware.
 * It extends the express.static middleware with the capability to serve (previously) gziped files. For this
 * it asumes, the gziped files are next to the original files.
 * @param {string} root: folder to staticly serve files from
 * @param {{ensureGzipedFiles:boolean,ensureBrotliFiles:boolean,customCompressions:[{name:string,extension:string}],indexFromEmptyFile:boolean}} options: options to change module behaviour  
 * @returns express middleware function
 */
function staticGzip(root, options) {
    options = options || {};
    //create a express.static middleware to handle serving files 
    var defaultStatic = express.static(root, options),
        compressions = [],
        gzipedFiles = null;

    //read compressions from options
    setupCompressions();

    //if at least one compression has been added, lookup files
    if (compressions.length > 0) {
        findAllCompressionFiles(require("fs"), root);
    }

    return function middleware(req, res, next) {
        changeUrlFromEmptyToIndexHtml(req);

        //check if browser supports gzip encoding
        var acceptEncoding = req.header("accept-encoding");
        var compression = findAvailableCompression(acceptEncoding);
        if (compression && isCompressedFileExisting(req.url, compression)) {
            convertToCompressedRequest(req, res, compression);
        }

        //allways call the default static file provider
        defaultStatic(req, res, next);
    };

    /**
     * Reads the options into a list of available compressions.
     */
    function setupCompressions() {
        //register all provided compressions
        if (options.customCompressions && options.customCompressions.length > 0) {
            for (var i = 0; i < options.customCompressions.length; i++) {
                var customCompression = options.customCompressions[i];
                registerCompression(customCompression.name, customCompression.extension);
            }
        }

        //enable brotli compression
        if (options.ensureBrotliFiles) {
            registerCompression("br", "br");
        }

        //enable gzip compression
        if (options.ensureGzipedFiles) {
            registerCompression("gzip", "gz");
        }

    }

    /**
     * Changes the url and adds required headers to serve a compressed file.
     * @param {Object} req
     * @param {Object} res
     */
    function convertToCompressedRequest(req, res, compression) {
        var type = mime.lookup(req.url);
        var charset = mime.charsets.lookup(type);

        req.url = req.url + compression.fileExtension;
        res.setHeader("Content-Encoding", compression.name);
        res.setHeader("Vary", "Accept-Encoding");
        res.setHeader("Content-Type", type + (charset ? "; charset=" + charset : ""));
    }

    /**
     * In case it's enabled in the options and the requested url does not request a specific file, "index.html" will be appended.
     * @param {Object} req
     */
    function changeUrlFromEmptyToIndexHtml(req) {
        if (options.indexFromEmptyFile && req.url.endsWith("/")) {
            req.url += "index.html";
        }
    }

    /**
     * Based on the browser's accepted encodings the first matching compression will be returned.
     * @param {string} acceptedEncoding
     * @returns {Compression}    
     */
    function findAvailableCompression(acceptedEncoding) {
        if (acceptedEncoding) {
            for (var i = 0; i < compressions.length; i++) {
                if (acceptedEncoding.indexOf(compressions[i].name) >= 0) {
                    return compressions[i];
                }
            }
        }
        return null;
    }

    /**
     * Tests if the given file is availabe in the provided compression format
     * @param {string} path
     * @param {Compression} compression
     * @returns {boolean}
     */
    function isCompressedFileExisting(path, compression) {
        var pathSplit = path.split("/");
        var fileName = pathSplit[pathSplit.length - 1];
        return compression.files.indexOf(fileName + compression.fileExtension) >= 0;
    }

    /**
     * Picks all files into the matching compression's file list. Search is done recursively!
     * @param {Object} fs: node.fs
     * @param {string} folderPath
     */
    function findAllCompressionFiles(fs, folderPath) {
        var files = fs.readdirSync(folderPath);
        //iterate all files in the current folder
        for (var i = 0; i < files.length; i++) {
            var filePath = folderPath + "/" + files[i];
            var stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                //recursively search folders and append the matching files
                findAllCompressionFiles(fs, filePath);
            } else {
                addFileToMatchingCompression(files[i]);
            }
        }
    }

    /**
     *Takes a filename and checks if there is any compression type matching the file extension.
     * @param {string} filePath
     */
    function addFileToMatchingCompression(filePath) {
        for (var i = 0; i < compressions.length; i++) {
            if (filePath.endsWith(compressions[i].fileExtension)) {
                compressions[i].files.push(filePath);
                return;
            }
        }
    }

    /**
     * Registers a new compression to the module.
     * @param {string} name
     * @param {string} fileExtension
     */
    function registerCompression(name, fileExtension) {
        if (!findCompressionByName(name))
            compressions.push(new Compression(name, fileExtension));
    }

    function Compression(name, fileExtension) {
        this.name = name;
        this.fileExtension = "." + fileExtension;
        this.files = [];
    }

    /**
     * Compression lookup by name.
     * @param {string} name
     * @returns {Compression}
     */
    function findCompressionByName(name) {
        for (var i = 0; i < compressions.length; i++) {
            if (compressions[i].name === name)
                return compressions[i];
        }
        return null;
    }
}
'use strict';


// For OpenShift builds:
//
// This is a one-time step to create the build-config
// oc new-build --binary --image-stream nodejs --name cluster-settings
//
// This runs a build (needed each time we make changes here)
// oc start-build cluster-settings --from-dir=.
//
// This takes the build and creates a deployment (pods, etc)
// oc new-app cluster-settings
// 1: This will initially fail because ENV vars need to be applied in the DEPLOYMENT)
// 2: Service: the targetPort must be changed from 8080 to 3002
// 3: I took the node.crt from an existing secret... lets see if this works.
//
// DOMAINS
// oc create route edge --service=cluster-settings cluster-settings --hostname cluster-settings.auracoda.com -n mz-a
//
// Mark Zlamal, 2022-11-21, Cockroach Labs

// CRDB objects & initialization
const MyPGModule = require('pg');

const config = {
    connectionString: process.env.CRDBConnString,
    max: 10,
    idleTimeoutMillis: 15000,
    ssl: {
        rejectUnauthorized: false,
        ca: process.env.CRDBNodeCrt
    }
};

const MyConnectionPool = new MyPGModule.Pool(config);


const HTTP = require('http');

const TheServer = HTTP.createServer(async (req, res) => {
    let URLQuery;
    const reqHostName = req.headers['x-forwarded-host'];
    if (reqHostName) {
        URLQuery = new URL(req.url, `https://${reqHostName}`);
    } else {
        URLQuery = new URL(req.url, 'http://localhost:3002');
    };

    const myHTML = [];
    myHTML.push('<html>');
    myHTML.push('<style>');
    myHTML.push(` \
    table { \
        border-collapse: collapse;
    } \
    th { \
        font-family: Helvetica;
        size: 0.8em;
        border: 1px solid gray;
    } \
    td { \
        font-family: Helvetica;
        size: 0.8em;
        border: 1px solid gray;
        padding: 0.1em 1.0em 0.1em 1.0em;
    } \
    .setting { \
        overflow-wrap: anywhere;
    } \
    .desc { \
        font-size: 0.7em;
    } \
    `);
    myHTML.push('</style>');


    myHTML.push('<body>');

    myHTML.push('<h3>CRDB Cluster Settings</h3>');
    myHTML.push('<p>These settings are based on the <a href=\'https://www.cockroachlabs.com/docs/stable/cluster-settings\' target=\'#\'>cluster-settings</a> DOCS on the Cockroach Labs website.</p>');

    // Show connection string, hiding credentials
    const connStringParts = process.env.CRDBConnString.split('@');
    myHTML.push(`<p><b style=\'color: purple;\'>CockroachDB Connection String: </b>postgresql://<span style=\'color:red;\'>&lt;Mark Zlamal\'s credentials hidden&gt;</span>@${connStringParts[1]}</p>`);

    // Create Table object
    myHTML.push('<table>');

    const MyClusterSettings = await MyConnectionPool.query('show cluster settings');

    // Create Table header
    myHTML.push('<tr><th>Setting Name</th><th>Current State</th><th>Description</th></tr>');

    // populate table with all the settings
    for (const clusterSetting of MyClusterSettings.rows) {
        if (clusterSetting.variable.toUpperCase().includes('LICENSE')) {
            myHTML.push(`<tr><td>${clusterSetting.variable}</td><td class=\'setting\' style=\'color:red;\'>Hidden Value</td><td class=\'desc\'>${clusterSetting.description}</td></tr>`);
        } else {
            myHTML.push(`<tr><td>${clusterSetting.variable}</td><td class=\'setting\'>${clusterSetting.value}</td><td class=\'desc\'>${clusterSetting.description}</td></tr>`);
        };
    };

    myHTML.push('</table>');

    myHTML.push('</body></html>');

    res.end(myHTML.join(''));
});


TheServer.listen(3002, () => {
    console.log('Server running');
});

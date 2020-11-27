#!/bin/bash

set -e # exit on any failure

pwd is $(pwd)
BASEDIR=$(pwd)/$(dirname $0)/../..
NETWORKDIR=$BASEDIR/deploy/networks
CONTAINER_NAME="genesis_sifnode1_1"

#
# Remove prior generations Config
#
echo "apologies for this sudo, it is to delete non-persisent cryptographic keys that usually has enhanced permissions"
sudo rm -rf $NETWORKDIR && mkdir $NETWORKDIR
make -C ${BASEDIR} install

#
# Startup ganache-cli and deploy peggy smart contracts
#
cd $BASEDIR/smart-contracts && yarn install
docker-compose -f $BASEDIR/deploy/genesis/docker-compose-ganache.yml up -d
if [ ! -f .env ]; then
  cp .env.example .env
fi
truffle deploy
ETHEREUM_CONTRACT_ADDRESS=$(cat $BASEDIR/smart-contracts/build/contracts/BridgeRegistry.json | jq '.networks["5777"].address')

#
# scaffold and boot the dockerized localnet
#
rake genesis:network:scaffold['localnet']
rake genesis:network:boot["localnet,${ETHEREUM_CONTRACT_ADDRESS},ae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f,ws://192.168.2.6:7545/"]

# prior command generations yaml that provides useful usernames and passwords
# wait for it to be complete
#
NETDEF=$NETWORKDIR/network-definition.yml
while [ ! -f $NETWORKDIR/network-definition.yml ]
do
  sleep 2
done
PASSWORD=$(cat $NETDEF | yq r - ".password")
ADDR=$(cat $NETDEF | yq r - ".address")
echo $PASSWORD
echo $ADDR

#
# Add keys for a second account to test functions against
#
docker exec ${CONTAINER_NAME} bash -c "/test/integration/add-second-account.sh"

#
# Wait for the Websocket subscriptions to be initialized (like 10 seconds)
#
docker logs -f ${CONTAINER_NAME} | grep -m 1 "Subscribed"

#
# Transfer Eth into Ceth in our validator account
#
cd $BASEDIR/smart-contracts
yarn peggy:lock ${ADDR} 0x0000000000000000000000000000000000000000 1000000000000000000

#
# Transfer Eth into Ceth on our User account 
# This also makes the account visible to sifnodecli q auth account <addr>

USER1ADDR=$(cat $NETDEF | yq r - "[1].address")
echo $USER1ADDR
sleep 5
yarn peggy:lock ${USER1ADDR} 0x0000000000000000000000000000000000000000 1000000000000000000
sleep 5

#
# Transfer Rowan from validator account to user account
#
docker exec ${CONTAINER_NAME} bash -c "/test/integration/add-rowan-to-second-account.sh"
sleep 5

#
# Run the python tests
#
docker exec ${CONTAINER_NAME} bash -c "python3 /test/integration/peggy-basic-test-docker.py"

# killing script will not end network use stop-integration-env.sh for that
# and note that we just allow the github actions environment to be cleaned
# up by their scripts

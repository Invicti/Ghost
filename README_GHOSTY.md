# Please first:
This is a fork of Ghost, it contains changes that are designed to keep the Ghost upstream compatible, so it can include upstream changes at any time.

One of the new features included in this release is the ability to send emails to Ghost subscribers through a self-hosted email campaign application.
The self-hosted open source compatible with this version is Mailtrain, not to be mixed with Mailgun that is the service currently supported by Ghost upstream code.
For your mailtrain installation to work you will have to set the following variables in your environment so Ghost can pick it up:
The environment variables are described and set below:

`mailtrain_url=https://mailtrain.yourdomain.com/api/templates/1/send
mailtrain_configuration_id_as_int=1
mailtrain_host=mailtrain.yourdomain.com`

For now this is an advanced installation requirement which is not covered by Ghosty so it is an experimental branch.

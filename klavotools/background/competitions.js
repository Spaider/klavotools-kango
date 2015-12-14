/**
 *  Competitions Module
 *
 *  The module checks for new open competitions and shows notifications.
*/

var Competitions = function() {
    // A reference to the deferred notification:
    this.notification = null;
    //active status of the module
    this.active = false;
    //point to timeout of this.check
    this.timer = false;
    
    /** default values **/
    this.rates = kango.storage.getItem('competition_rates') || [3, 5]; //x3, x5
    this.delay = kango.storage.getItem('competition_delay');
    this.displayTime = kango.storage.getItem('competition_displayTime');
    if (typeof this.delay != 'number') {
        // 1 minute:
        this.delay = 60;
    }
    if (typeof this.displayTime != 'number') {
        // 10 seconds:
        this.displayTime = 10;
    }

    if (this.delay * this.rates.length > 0) {
        this.activate();
    }
};

Competitions.prototype.getParams = function() {
    return {
        rates: this.rates,
        delay: this.delay,
        displayTime: this.displayTime,
    };
};

Competitions.prototype.setParams = function(param) {
    this.rates = param.rates || this.rates;
    this.displayTime = param.displayTime || this.displayTime;
    if (param.delay >= 0) {
        this.delay = param.delay;
    }

    kango.storage.setItem('competition_delay', this.delay);
    kango.storage.setItem('competition_rates', this.rates);
    kango.storage.setItem('competition_rates', this.rates);
    kango.storage.setItem('competition_displayTime', this.displayTime);

    if (this.delay * this.rates.length === 0) return this.deactivate();

    if (param.delay || param.displayTime) {
        this.deactivate();
        this.activate();
    }
};

Competitions.prototype.activate = function() {
    if(this.active)
        return console.log('active already');
    
   this.active = true;
   this.check();
};

Competitions.prototype.deactivate = function() {
    if(!this.active)
        return console.log('deactive already');
    
    clearTimeout(this.timer);
    if (typeof this.notification === 'object') {
        this.notification.revoke();
    }
    this.active = false;
};

Competitions.prototype.check = function() {
    if(!this.active) { return; }
    var self = this;
    
    var details = {
        method: 'POST',
        url: 'http://klavogonki.ru/gamelist.data?KTS_REQUEST',
        async: true,
        params: {
            'cached_users': '0'
        },
        contentType: 'json'
    };

    kango.xhr.send(details, function(res) {
        /**
        * FIXME: if @status isn't equal to 200, @check will not performed anymore
        */        
        if(res.status != 200) { return; }
        res = res.response;
        
        clearTimeout(self.timer);
        
        if(!res.gamelist[0].params.competition) {
            self.timer = setTimeout(function() { self.check() }, 10 * 1000);
            return false;
        }
            
        var serverTime = res.time;
        var rate = res.gamelist[0].params.regular_competition || 1;
        var beginTime = res.gamelist[0].begintime;
        var gmid = res.gamelist[0].id;
        var remainingTime = beginTime - serverTime;

        if (remainingTime <= 0) {
            self.timer = setTimeout(function() { self.check() }, 120 * 1000);
            return false;
        }
        
        /** next check in (start + 2) minutes **/
        self.timer = setTimeout(function() { self.check() }, (remainingTime + 120) * 1000);
        
        /** does user want to see competition with this rate? **/
        if(!~self.rates.indexOf(rate)) {
            return false;
        }

        var timer = remainingTime - self.delay;
        if(timer < 1)
            timer = 1;

        var title = 'Соревнование';
        var body = 'Соревнование x'+rate+' начинается';
        var icon = kango.io.getResourceUrl('res/kg_logo.svg');

        var displayTime = self.displayTime;
        if (displayTime > remainingTime) {
            displayTime = remainingTime;
        }

        self.notification = new DeferredNotification(title, {
            body: body,
            icon: icon,
            displayTime: displayTime,
        });
        self.notification.onclick = function () {
            kango.browser.tabs.create({
                url: 'http://klavogonki.ru/g/?gmid='+gmid,
                focused: true,
            });
        };
        self.notification.show(timer);
    });
};

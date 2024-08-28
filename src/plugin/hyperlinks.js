import Worker from "../worker.js";
import { unitConvert } from "../utils.js";

// Debug hyperlink functionality to the PDF creation.

// Main link array, and refs to original functions.
var linkInfo = [];
var orig = {
  toContainer: Worker.prototype.toContainer,
  toPdf: Worker.prototype.toPdf,
};

function elementToTopLeftPage(clientRects, containerRect, prop, opt) {
  let arr = [];

  for (let i = 0; i < clientRects.length; i++) {
    let clientRect = unitConvert(clientRects[i], prop.pageSize.k);
    clientRect.left -= containerRect.left;
    clientRect.top -= containerRect.top;

    let page = Math.floor(clientRect.top / prop.pageSize.inner.height) + 1;
    let top = opt.margin[0] + (clientRect.top % prop.pageSize.inner.height);
    let left = opt.margin[1] + clientRect.left;

    arr.push({ page: page, top: top, left: left, clientRect: clientRect });
  }

  return arr;
}

Worker.prototype.toContainer = function toContainer() {
  return orig.toContainer.call(this).then(function toContainer_hyperlink() {
    // Retrieve hyperlink info if the option is enabled.
    if (this.opt.enableLinks) {
      // Find all anchor tags and get the container's bounds for reference.
      var container = this.prop.container;
      var links = container.querySelectorAll("a");
      var containerRect = unitConvert(
        container.getBoundingClientRect(),
        this.prop.pageSize.k
      );
      linkInfo = [];

      // Loop through each anchor tag.
      Array.prototype.forEach.call(
        links,
        function (link) {
          // Treat each client rect as a separate link (for text-wrapping).
          let clientRects = link.getClientRects();

          //if the link is a link to another page, we need to flag it
          let linkToAnotherPage = undefined;
          if (link.href.includes("#")) {
            //Find the element it is linking to
            let target = link.href.split("#")[1];
            let targetElement = document.getElementById(target);
            //if the element exists, find where it is
            if (targetElement) {
              let targetElementBoxArray = elementToTopLeftPage(
                targetElement.getClientRects(),
                containerRect,
                this.prop,
                this.opt
              );

              //TODO: This should return an array of elements, but for now we will just take the first one
              //There is a edge case where the element is split between pages, but we will ignore that for now
              if (targetElementBoxArray.length > 0) {
                let firstElement = targetElementBoxArray[0];

                linkToAnotherPage = {
                  page: firstElement.page,
                  top: firstElement.top,
                  left: firstElement.left,
                  clientRect: firstElement.clientRect,
                };
              }
            } else {
              linkToAnotherPage = {
                emptyLink: true,
              };
            }
          }

          let topLeftPageCArr = elementToTopLeftPage(
            clientRects,
            containerRect,
            this.prop,
            this.opt
          ); // top left page clientrects

          for (let i = 0; i < topLeftPageCArr.length; i++) {
            let tlp = topLeftPageCArr[i]; // top left page

            linkInfo.push({
              page: tlp.page,
              top: tlp.top,
              left: tlp.left,
              clientRect: tlp.clientRect,
              link: link,
              linkToAnotherPage: linkToAnotherPage,
            });
          }
        },
        this
      );
    }
  });
};

Worker.prototype.toPdf = function toPdf() {
  return orig.toPdf.call(this).then(function toPdf_hyperlink() {
    // Add hyperlinks if the option is enabled.
    if (this.opt.enableLinks) {
      const scrollOffsetAmt = opt.scrollOffsetAmt || 50; //Ocasionally we scroll past it, so this is a hack to scroll up a bit

      // Attach each anchor tag based on info from toContainer().
      linkInfo.forEach(function (l) {
        this.prop.pdf.setPage(l.page);

        let urlOptions = undefined;
        if (l.linkToAnotherPage) {
          if (!l.linkToAnotherPage.emptyLink) {
            urlOptions = {
              pageNumber: l.linkToAnotherPage.page + 1, //Pages are off by 1 so this fixes that. It is not coherent with the page nuumbering is 0 or 1 based in this code base
              top: l.linkToAnotherPage.top - scrollOffsetAmt,
            };
          }
        } else {
          urlOptions = { url: l.link.href };
        }

        //Make the link go somewhere
        //If options are undefined, the link will not be created
        if (urlOptions) {
          this.prop.pdf.link(
            l.left,
            l.top,
            l.clientRect.width,
            l.clientRect.height,
            urlOptions
          );
        }
      }, this);

      // Reset the active page of the PDF to the final page.
      var nPages = this.prop.pdf.internal.getNumberOfPages();
      this.prop.pdf.setPage(nPages);
    }
  });
};
